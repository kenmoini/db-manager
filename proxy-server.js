#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import http from 'http';
import net from 'net';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { createPool, sql } from 'slonik';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration files
let serverConfig = {};
let templatesConfig = {};

try {
  const configPath = path.join(__dirname, 'config.server.json');
  if (fs.existsSync(configPath)) {
    serverConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('📋 Loaded server configuration from config.server.json');
  }
} catch (error) {
  console.error('⚠️  Error loading config.server.json:', error.message);
}

try {
  const templatesPath = path.join(__dirname, 'config.templates.json');
  if (fs.existsSync(templatesPath)) {
    templatesConfig = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
    console.log('📋 Loaded templates configuration from config.templates.json');
  }
} catch (error) {
  console.error('⚠️  Error loading config.templates.json:', error.message);
}

// Logging functionality
const LOG_FILE_PATH = path.join(process.cwd(), serverConfig.logging?.logFile || 'proxy-server.log');
const LOGGING_ENABLED = serverConfig.logging?.enabled !== false;
const CONSOLE_OUTPUT = serverConfig.logging?.consoleOutput !== false;

// Create a write stream for the log file (append mode)
const logStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' });

// Store original console methods before overriding
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Enhanced logging function that writes to both console and file
function log(level, message, ...args) {
  if (!LOGGING_ENABLED && level !== 'error') return;
  
  const timestamp = new Date().toISOString();
  const formattedMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${formattedMessage}`;
  
  // Write to console with original formatting if enabled
  if (CONSOLE_OUTPUT) {
    if (level === 'error') {
      originalConsoleError(message, ...args);
    } else if (level === 'warn') {
      originalConsoleWarn(message, ...args);
    } else {
      originalConsoleLog(message, ...args);
    }
  }
  
  // Write to log file if logging is enabled (strip ANSI codes and emojis for cleaner file logs)
  if (LOGGING_ENABLED && logStream && !logStream.destroyed) {
    const cleanLogEntry = logEntry.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').replace(/[^\x00-\x7F]/g, '');
    logStream.write(cleanLogEntry + '\n');
  }
}

// Override console methods to use our logging function
console.log = (...args) => log('info', ...args);
console.error = (...args) => log('error', ...args);
console.warn = (...args) => log('warn', ...args);

// Log initialization message
console.log(`📝 Logging initialized - writing to ${LOG_FILE_PATH}`);

// Ensure log stream is properly closed on exit
process.on('SIGINT', () => {
  logStream.end();
  originalConsoleLog('\n👋 Shutting down proxy server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logStream.end();
  originalConsoleLog('\n👋 Shutting down proxy server...');
  process.exit(0);
});

const app = express();
const PORT = process.env.PORT || serverConfig.server?.port || 3000;
const HOST = process.env.HOST || serverConfig.server?.host || '127.0.0.1';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Configure CORS based on environment and config
const corsEnabled = serverConfig.server?.cors?.enabled !== false;
const corsOptions = NODE_ENV === 'production' 
  ? {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : 
              serverConfig.server?.cors?.origins || false,
      credentials: true
    }
  : {
      origin: serverConfig.server?.cors?.origins || 
              ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
      credentials: true
    };

// Enable CORS if configured
if (corsEnabled) {
  app.use(cors(corsOptions));
}

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Default Docker socket paths
const DEFAULT_SOCKET_PATHS = [
  '/var/run/docker.sock',
  `/run/user/${process.getuid()}/podman/podman.sock`,
  '/run/podman/podman.sock',
  '/var/run/podman/podman.sock'
];

// Function to find the active Docker/Podman socket
function findDockerSocket() {
  for (const socketPath of DEFAULT_SOCKET_PATHS) {
    try {
      if (fs.existsSync(socketPath)) {
        // Test if the socket is actually accessible
        const stats = fs.statSync(socketPath);
        if (stats.isSocket()) {
          console.log(`Found Docker/Podman socket at: ${socketPath}`);
          return socketPath;
        }
      }
    } catch (error) {
      // Continue checking other paths
    }
  }
  return null;
}

// Get socket path from environment or auto-detect
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || process.env.PODMAN_SOCKET || findDockerSocket();

if (!DOCKER_SOCKET) {
  console.error('❌ No Docker/Podman socket found. Please ensure Docker or Podman is running and one of these sockets exists:');
  DEFAULT_SOCKET_PATHS.forEach(path => console.error(`   - ${path}`));
  console.error('\nTo start Docker service, run:');
  console.error('   sudo systemctl start docker');
  console.error('\nTo start Podman socket service, run:');
  console.error('   systemctl --user enable --now podman.socket');
  process.exit(1);
}

console.log(`🔌 Using Docker/Podman socket: ${DOCKER_SOCKET}`);

// Function to make HTTP requests over Unix socket
function makeUnixSocketRequest(socketPath, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    
    // Prepare HTTP request
    const httpRequest = [
      `${method} ${path} HTTP/1.1`,
      'Host: podman',
      'Connection: close',
      'User-Agent: db-manager-proxy/1.0',
      ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
      '',
      body || ''
    ].join('\r\n');

    let responseData = '';
    
    socket.on('connect', () => {
      socket.write(httpRequest);
    });

    socket.on('data', (data) => {
      responseData += data.toString('binary');
    });

    socket.on('end', () => {
      try {
        // Parse HTTP response - handle both CRLF and LF line endings
        const [headerSection, ...bodyParts] = responseData.split(/\r?\n\r?\n/);
        const headers = headerSection.split(/\r?\n/);
        const statusLine = headers[0];
        const statusMatch = statusLine.match(/HTTP\/1\.\d (\d+) (.+)/);
        
        if (!statusMatch) {
          console.error('Raw response data:', responseData.substring(0, 200));
          reject(new Error('Invalid HTTP response from Docker/Podman socket'));
          return;
        }

        const statusCode = parseInt(statusMatch[1]);
        const statusText = statusMatch[2];
        let body = bodyParts.join('\r\n\r\n');

        // Parse response headers
        const responseHeaders = {};
        headers.slice(1).forEach(header => {
          const [key, ...valueParts] = header.split(':');
          if (key && valueParts.length > 0) {
            responseHeaders[key.toLowerCase().trim()] = valueParts.join(':').trim();
          }
        });

        // Handle chunked encoding if present
        if (responseHeaders['transfer-encoding'] === 'chunked') {
          // Simple chunked decoding
          body = body.replace(/^[0-9a-fA-F]+\r?\n/gm, '').replace(/\r?\n0\r?\n\r?\n$/, '');
        }

        // Clean up control characters and invalid JSON characters
        body = body
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove all control characters including extended ASCII
          .replace(/\u0000/g, '') // Remove null characters
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove Unicode control characters
          .replace(/\r\n/g, '\n') // Normalize line endings
          .replace(/\r/g, '\n') // Convert remaining CR to LF
          .trim();

        resolve({
          statusCode,
          statusText,
          headers: responseHeaders,
          body: body
        });
      } catch (error) {
        reject(new Error(`Error parsing response: ${error.message}`));
      }
    });

    socket.on('error', (error) => {
      reject(new Error(`Socket error: ${error.message}`));
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Socket connection timeout'));
    });

    socket.setTimeout(30000); // 30 second timeout
  });
}

// Proxy middleware for Docker/Podman API requests
app.all('/api/podman/*', async (req, res) => {
  try {
    const socketPath = req.headers['x-socket-path'] || DOCKER_SOCKET;
    const apiPath = req.path.replace('/api/podman', '');
    
    // Determine if we're talking to Docker or Podman and use appropriate API paths
    const isDockerSocket = socketPath.includes('docker.sock');
    let fullPath;
    
    if (isDockerSocket) {
      // Docker API paths
      fullPath = `/v1.41${apiPath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    } else {
      // Podman libpod API paths
      fullPath = `/v4.0.0/libpod${apiPath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    }
    
    console.log(`📡 ${req.method} ${fullPath} via ${socketPath}`);

    // Prepare request body
    let requestBody = '';
    if (req.body && Object.keys(req.body).length > 0) {
      requestBody = JSON.stringify(req.body);
    }

    // Prepare headers
    const requestHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody).toString()
    };

    const response = await makeUnixSocketRequest(
      socketPath,
      req.method,
      fullPath,
      requestBody,
      requestHeaders
    );

    // Set response headers
    res.status(response.statusCode);
    
    // Set content type if provided
    if (response.headers['content-type']) {
      res.set('Content-Type', response.headers['content-type']);
    }

    // Handle different response types
    if (fullPath.includes('/logs')) {
      // Container logs are binary data that need special handling
      // Convert binary string back to Buffer for proper transmission
      const binaryBuffer = Buffer.from(response.body, 'binary');
      res.set('Content-Type', 'application/octet-stream');
      res.send(binaryBuffer);
    } else if (response.headers['content-type']?.includes('application/json') && response.body) {
      // Try to parse as JSON, fallback to text
      try {
        // Additional JSON cleaning before parsing
        let cleanBody = response.body
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove all control characters including extended ASCII
          .replace(/\u0000/g, '') // Remove null characters
          .replace(/\\u0000/g, '') // Remove escaped null characters
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove Unicode control characters
          .replace(/\r\n/g, '\n') // Normalize line endings
          .replace(/\r/g, '\n') // Convert remaining CR to LF
          .trim();
          
        const jsonBody = JSON.parse(cleanBody);
        res.json(jsonBody);
      } catch (parseError) {
        console.error('JSON parse error:', parseError.message);
        console.error('Raw body (first 200 chars):', response.body.substring(0, 200));
        res.send(response.body);
      }
    } else {
      res.send(response.body);
    }

  } catch (error) {
    console.error(`❌ Proxy error: ${error.message}`);
    res.status(500).json({
      error: 'Proxy Error',
      message: error.message,
      details: 'Unable to communicate with Podman socket'
    });
  }
});

// Filesystem listing endpoint (for checking if path exists)
app.get('/api/filesystem/ls', async (req, res) => {
  try {
    const dirPath = req.query.path || '/';
    
    // Security check - prevent directory traversal attacks
    const safePath = path.resolve(dirPath);
    if (!safePath.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    // Check if path exists
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'Path not found' });
    }
    
    const stats = fs.statSync(safePath);
    
    res.json({
      exists: true,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      path: safePath,
      size: stats.size,
      modified: stats.mtime,
      permissions: stats.mode
    });
    
  } catch (error) {
    console.error(`❌ Filesystem ls error: ${error.message}`);
    res.status(500).json({
      error: 'Filesystem Error',
      message: error.message
    });
  }
});

// Database connection API endpoints
app.post('/api/database/connect', async (req, res) => {
  const { containerId, host, port, username, password, database, type } = req.body;
  
  if (!host || !port || !username || !type) {
    return res.status(400).json({ error: 'Missing required connection parameters' });
  }
  
  try {
    log(`Attempting to connect to ${type} database at ${host}:${port}`);
    
    if (type === 'mariadb' || type === 'mysql') {
      // Connect to MariaDB/MySQL
      const connection = await mysql.createConnection({
        host,
        port: parseInt(port),
        user: username,
        password: password || '',
        database: database || undefined
      });
      
      // Get databases with size info
      const [databases] = await connection.execute(`
        SELECT 
          SCHEMA_NAME as name,
          ROUND(SUM(DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as size_mb,
          DEFAULT_CHARACTER_SET_NAME as encoding,
          DEFAULT_COLLATION_NAME as collation
        FROM information_schema.SCHEMATA
        LEFT JOIN information_schema.TABLES ON SCHEMATA.SCHEMA_NAME = TABLES.TABLE_SCHEMA
        GROUP BY SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
        ORDER BY SCHEMA_NAME
      `);
      
      await connection.end();
      
      res.json({ 
        success: true, 
        databases: databases.map(db => ({
          ...db,
          size: db.size_mb ? `${db.size_mb} MB` : '0 MB',
          owner: username // MySQL doesn't have database owners like PostgreSQL
        })),
        message: 'Successfully connected to MariaDB/MySQL' 
      });
    } else if (type === 'postgresql') {
      // Connect to PostgreSQL using slonik
      const connectionString = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password || '')}@${host}:${port}/${database || 'postgres'}`; 
      const pool = await createPool(connectionString);
      
      // Get databases with additional info
      const result = await pool.any(sql.unsafe`
        SELECT datname as name, 
               pg_size_pretty(pg_database_size(datname)) as size,
               datcollate as collation,
               pg_catalog.pg_get_userbyid(datdba) as owner,
               pg_encoding_to_char(encoding) as encoding
        FROM pg_database 
        WHERE datistemplate = false
        ORDER BY datname
      `);
      
      await pool.end();
      
      res.json({
        success: true, 
        databases: result,
        message: 'Successfully connected to PostgreSQL' 
      });
    } else {
      res.status(400).json({ error: `Unsupported database type: ${type}` });
    }
  } catch (error) {
    log('Database connection error:', error);
    res.status(500).json({ 
      error: 'Failed to connect to database',
      details: error.message 
    });
  }
});

app.post('/api/database/users', async (req, res) => {
  const { host, port, username, password, type } = req.body;
  
  if (!host || !port || !username || !type) {
    return res.status(400).json({ error: 'Missing required connection parameters' });
  }
  
  try {
    log(`Fetching users from ${type} database at ${host}:${port}`);
    
    if (type === 'mariadb' || type === 'mysql') {
      // Connect to MariaDB/MySQL
      const connection = await mysql.createConnection({
        host,
        port: parseInt(port),
        user: username,
        password: password || '',
        database: 'mysql'
      });
      
      // Get users with their privileges
      const [users] = await connection.execute(`
        SELECT 
          user as username,
          host,
          CASE 
            WHEN Super_priv = 'Y' THEN 'Superuser'
            WHEN Select_priv = 'Y' AND Insert_priv = 'Y' AND Update_priv = 'Y' AND Delete_priv = 'Y' THEN 'Full Access'
            WHEN Select_priv = 'Y' THEN 'Read Only'
            ELSE 'Limited'
          END as privileges,
          authentication_string IS NOT NULL as has_password
        FROM mysql.user
        ORDER BY user, host
      `);
      
      await connection.end();
      
      // Group users by username and combine hosts
      const userMap = new Map();
      
      users.forEach(user => {
        const key = user.username;
        if (userMap.has(key)) {
          const existing = userMap.get(key);
          // Add host to the list
          existing.hosts.push(user.host);
          // Use the highest privilege level
          if (user.privileges === 'Superuser') {
            existing.privileges = 'Superuser';
          } else if (existing.privileges !== 'Superuser' && user.privileges === 'Full Access') {
            existing.privileges = 'Full Access';
          } else if (existing.privileges !== 'Superuser' && existing.privileges !== 'Full Access' && user.privileges === 'Read Only') {
            existing.privileges = 'Read Only';
          }
          // Keep password as Yes if any entry has a password
          if (user.has_password) {
            existing.has_password = true;
          }
        } else {
          userMap.set(key, {
            username: user.username,
            hosts: [user.host],
            privileges: user.privileges,
            has_password: user.has_password
          });
        }
      });
      
      // Convert map to array and format hosts for display
      // Filter out system users
      const formattedUsers = Array.from(userMap.values())
        .filter(user => !['healthcheck', 'mariadb.sys', 'mysql.sys', 'mysql.session', 'mysql.infoschema'].includes(user.username))
        .map(user => ({
          username: user.username,
          host: user.hosts.join(', '),
          privileges: user.privileges,
          has_password: user.has_password ? 'Yes' : 'No'
        }));
      
      res.json({ 
        success: true, 
        users: formattedUsers,
        message: 'Successfully fetched MariaDB/MySQL users' 
      });
    } else if (type === 'postgresql') {
      // Connect to PostgreSQL using slonik
      const connectionString = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password || '')}@${host}:${port}/postgres`;
      const pool = await createPool(connectionString);
      
      // Get users with their privileges, excluding system users
      const result = await pool.any(sql.unsafe`
        SELECT 
          usename as username,
          CASE 
            WHEN usesuper THEN 'Superuser'
            WHEN usecreatedb THEN 'Can Create DB'
            ELSE 'Normal User'
          END as privileges,
          CASE 
            WHEN passwd IS NOT NULL THEN 'Yes'
            ELSE 'No'
          END as has_password,
          valuntil as valid_until
        FROM pg_user
        WHERE usename NOT IN ('pg_read_all_settings', 'pg_read_all_stats', 'pg_stat_scan_tables', 
                              'pg_read_server_files', 'pg_write_server_files', 'pg_execute_server_program',
                              'pg_signal_backend', 'pg_monitor', 'pg_database_owner', 'pg_checkpoint',
                              'pg_use_reserved_connections', 'pg_create_subscription')
        ORDER BY usename
      `);
      
      await pool.end();
      
      res.json({ 
        success: true, 
        users: result,
        message: 'Successfully fetched PostgreSQL users' 
      });
    } else {
      res.status(400).json({ error: `Unsupported database type: ${type}` });
    }
  } catch (error) {
    log('Database users fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch users',
      details: error.message 
    });
  }
});

app.post('/api/database/create-user', async (req, res) => {
  const { host, port, username, password, type, newUsername, newPassword, newHost } = req.body;
  
  if (!host || !port || !username || !type || !newUsername || !newPassword) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  try {
    log(`Creating user ${newUsername} on ${type} database at ${host}:${port}`);
    
    if (type === 'mariadb' || type === 'mysql') {
      const connection = await mysql.createConnection({
        host,
        port: parseInt(port),
        user: username,
        password: password || ''
      });
      
      // Use safe escaping for user creation
      const userHost = newHost || '%';
      
      // MySQL requires special handling for CREATE USER
      // Using quote function to safely escape values
      const quotedUser = connection.escape(newUsername);
      const quotedHost = connection.escape(userHost);
      const quotedPass = connection.escape(newPassword);
      
      // Create user statement - note the quotes are already included from escape()
      const createUserSQL = `CREATE USER IF NOT EXISTS ${quotedUser}@${quotedHost} IDENTIFIED BY ${quotedPass}`;
      await connection.execute(createUserSQL);
      
      // Flush privileges to apply changes
      await connection.execute('FLUSH PRIVILEGES');
      
      await connection.end();
      
      res.json({ 
        success: true, 
        message: `User '${newUsername}'@'${userHost}' created successfully` 
      });
    } else if (type === 'postgresql') {
      // Connect to PostgreSQL using slonik
      const connectionString = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password || '')}@${host}:${port}/postgres`;
      const pool = await createPool(connectionString);
      
      // PostgreSQL uses different syntax and doesn't have host-based users
      // Slonik automatically handles parameterization and SQL injection prevention
      await pool.query(sql.unsafe`
        CREATE USER ${sql.identifier([newUsername])} WITH PASSWORD ${sql.literalValue(newPassword)}
      `);

      await pool.end();
      
      res.json({ 
        success: true, 
        message: `User '${newUsername}' created successfully` 
      });
    } else {
      res.status(400).json({ error: `Unsupported database type: ${type}` });
    }
  } catch (error) {
    log('Create user error:', error);
    res.status(500).json({ 
      error: 'Failed to create user',
      details: error.message 
    });
  }
});

app.post('/api/database/execute', async (req, res) => {
  const { host, port, username, password, type, query } = req.body;
  
  if (!host || !port || !username || !type || !query) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  try {
    log(`Executing SQL on ${type} database at ${host}:${port}`);
    
    if (type === 'mariadb' || type === 'mysql') {
      const connection = await mysql.createConnection({
        host,
        port: parseInt(port),
        user: username,
        password: password || '',
        multipleStatements: true // Allow multiple SQL statements
      });
      
      // Execute the query
      const [result] = await connection.execute(query);
      await connection.end();
      
      // Format response based on query type
      if (Array.isArray(result)) {
        // SELECT query - return rows
        res.json({ 
          success: true, 
          rows: result,
          rowCount: result.length
        });
      } else {
        // INSERT/UPDATE/DELETE query - return affected rows
        res.json({ 
          success: true, 
          message: `Query executed successfully. ${result.affectedRows || 0} rows affected.`,
          affectedRows: result.affectedRows,
          insertId: result.insertId
        });
      }
    } else if (type === 'postgresql') {
      // Connect to PostgreSQL using slonik
      const connectionString = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password || '')}@${host}:${port}/postgres`;
      const pool = await createPool(connectionString);
      
      const result = await pool.any(sql.unsafe`${query}`);
      await pool.end();
      
      // Format response based on query result
      if (result && result.length > 0) {
        res.json({ 
          success: true, 
          rows: result,
          message: `Query executed successfully. ${result.length} rows returned.`
        });
      } else {
        res.json({ 
          success: true, 
          message: 'Query executed successfully',
          rows: result || []
        });
      }
    } else {
      res.status(400).json({ error: `Unsupported database type: ${type}` });
    }
  } catch (error) {
    log('SQL execution error:', error);
    res.status(500).json({ 
      error: 'Failed to execute SQL command',
      details: error.message 
    });
  }
});

app.post('/api/database/query', async (req, res) => {
  const { host, port, username, password, database, type, query } = req.body;
  
  if (!host || !port || !username || !type || !query) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  try {
    if (type === 'mariadb' || type === 'mysql') {
      const connection = await mysql.createConnection({
        host,
        port: parseInt(port),
        user: username,
        password: password || '',
        database
      });
      
      const [rows, fields] = await connection.execute(query);
      await connection.end();
      
      res.json({ success: true, rows, fields });
    } else if (type === 'postgresql') {
      // Connect to PostgreSQL using slonik
      const connectionString = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password || '')}@${host}:${port}/${database}`;
      const pool = await createPool(connectionString);
      
      const result = await pool.any(sql.unsafe`${query}`);
      await pool.end();
      
      res.json({ 
        success: true, 
        rows: result, 
        fields: [] 
      });
    } else {
      res.status(400).json({ error: `Unsupported database type: ${type}` });
    }
  } catch (error) {
    log('Database query error:', error);
    res.status(500).json({ 
      error: 'Failed to execute query',
      details: error.message 
    });
  }
});

// Filesystem browsing endpoint
app.get('/api/filesystem', async (req, res) => {
  try {
    const dirPath = req.query.path || '/';
    
    // Security check - prevent directory traversal attacks
    const safePath = path.resolve(dirPath);
    if (!safePath.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    // Check if path exists and is a directory
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'Path not found' });
    }
    
    const stats = fs.statSync(safePath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }
    
    // Read directory contents
    const items = fs.readdirSync(safePath, { withFileTypes: true })
      .map(dirent => ({
        name: dirent.name,
        isDirectory: dirent.isDirectory(),
        path: path.join(safePath, dirent.name)
      }))
      .filter(item => item.isDirectory) // Only return directories
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // Add parent directory if not at root
    const parentPath = path.dirname(safePath);
    const result = {
      currentPath: safePath,
      parentPath: safePath !== '/' ? parentPath : null,
      directories: items
    };
    
    res.json(result);
  } catch (error) {
    console.error(`❌ Filesystem browse error: ${error.message}`);
    res.status(500).json({
      error: 'Filesystem Error',
      message: error.message
    });
  }
});

// Directory creation endpoint
app.post('/api/filesystem/mkdir', async (req, res) => {
  try {
    const { path: dirPath, name, owner, group, mode } = req.body;
    
    if (!dirPath || !name) {
      return res.status(400).json({ error: 'Path and name are required' });
    }
    
    // Security check - prevent directory traversal attacks
    const safePath = path.resolve(dirPath);
    if (!safePath.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    // Validate directory name
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return res.status(400).json({ error: 'Invalid directory name. Only letters, numbers, dots, underscores, and hyphens are allowed.' });
    }
    
    // Validate mode permissions (if provided)
    if (mode && !/^[0-7]{3,4}$/.test(mode.toString())) {
      return res.status(400).json({ 
        error: 'Invalid mode. Must be octal notation (e.g., 755, 644, 0755)' 
      });
    }
    
    // Check if parent path exists and is a directory
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'Parent path not found' });
    }
    
    const parentStats = fs.statSync(safePath);
    if (!parentStats.isDirectory()) {
      return res.status(400).json({ error: 'Parent path is not a directory' });
    }
    
    // Create the new directory path
    const newDirPath = path.join(safePath, name);
    
    // Check if directory already exists
    if (fs.existsSync(newDirPath)) {
      return res.status(409).json({ error: 'Directory already exists' });
    }
    
    // Create the directory
    fs.mkdirSync(newDirPath);
    console.log(`📁 Created directory: ${newDirPath}`);
    
    // Set advanced permissions and ownership if provided
    const operations = [];
    const warnings = [];
    
    try {
      // Set mode permissions if provided
      if (mode) {
        execSync(`chmod ${mode} "${newDirPath}"`);
        operations.push(`permissions set to ${mode}`);
        console.log(`� Set permissions ${mode} on ${newDirPath}`);
      }
      
      // Set ownership if provided
      if (owner || group) {
        let chownCommand = 'chown ';
        if (owner && group) {
          chownCommand += `${owner}:${group}`;
        } else if (owner) {
          chownCommand += `${owner}`;
        } else if (group) {
          chownCommand += `:${group}`;
        }
        chownCommand += ` "${newDirPath}"`;
        
        execSync(chownCommand);
        const ownershipDesc = owner && group ? `${owner}:${group}` : owner ? owner : `:${group}`;
        operations.push(`ownership set to ${ownershipDesc}`);
        console.log(`👤 Set ownership ${ownershipDesc} on ${newDirPath}`);
      }
      
    } catch (permError) {
      // Directory was created but permission/ownership setting failed
      console.warn(`⚠️ Failed to set permissions/ownership: ${permError.message}`);
      warnings.push(`Failed to set permissions/ownership: ${permError.message}`);
    }
    
    const response = {
      success: true, 
      path: newDirPath,
      message: `Directory '${name}' created successfully${operations.length > 0 ? ' with ' + operations.join(' and ') : ''}`
    };
    
    if (operations.length > 0) {
      response.operations = operations;
    }
    
    if (warnings.length > 0) {
      response.warnings = warnings;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error(`❌ Directory creation error: ${error.message}`);
    res.status(500).json({
      error: 'Directory Creation Error',
      message: error.message
    });
  }
});

// Port availability check endpoint
app.get('/api/port/check', async (req, res) => {
  try {
    const port = parseInt(req.query.port);
    
    if (!port || port < 1 || port > 65535) {
      return res.status(400).json({ 
        error: 'Invalid port number. Port must be between 1 and 65535' 
      });
    }
    
    // Check if port is in use by attempting to create a server on it
    const checkPortAvailability = (portNumber) => {
      return new Promise((resolve) => {
        const server = net.createServer();
        
        server.listen(portNumber, (err) => {
          if (err) {
            resolve(false); // Port is in use
          } else {
            server.close(() => {
              resolve(true); // Port is available
            });
          }
        });
        
        server.on('error', () => {
          resolve(false); // Port is in use or there's an error
        });
      });
    };
    
    const isAvailable = await checkPortAvailability(port);
    
    console.log(`🔍 Port ${port} availability check: ${isAvailable ? 'available' : 'in use'}`);
    
    res.json({
      port: port,
      available: isAvailable,
      status: isAvailable ? 'available' : 'in_use',
      message: isAvailable 
        ? `Port ${port} is available` 
        : `Port ${port} is already in use`
    });
    
  } catch (error) {
    console.error(`❌ Port check error: ${error.message}`);
    res.status(500).json({
      error: 'Port Check Error',
      message: error.message
    });
  }
});

// Container user info endpoint
app.post('/api/container/user-info', async (req, res) => {
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'Image name is required' });
    }
    
    console.log(`🔍 Getting user info for image: ${image}`);
    
    // Determine the container runtime command based on the socket path
    const isDockerSocket = DOCKER_SOCKET.includes('docker.sock');
    let containerCmd;
    
    // Check which command is actually available
    try {
      if (isDockerSocket) {
        // Try docker first
        execSync('which docker', { encoding: 'utf8', stdio: 'ignore' });
        containerCmd = 'docker';
      } else {
        // Try podman first
        execSync('which podman', { encoding: 'utf8', stdio: 'ignore' });
        containerCmd = 'podman';
      }
    } catch (e) {
      // Fallback: try the other command
      try {
        if (isDockerSocket) {
          execSync('which podman', { encoding: 'utf8', stdio: 'ignore' });
          containerCmd = 'podman';
          console.log(`⚠️ Docker socket detected but using podman command`);
        } else {
          execSync('which docker', { encoding: 'utf8', stdio: 'ignore' });
          containerCmd = 'docker';
          console.log(`⚠️ Podman socket detected but using docker command`);
        }
      } catch (fallbackError) {
        throw new Error('Neither docker nor podman command is available in PATH');
      }
    }
    
    // Run container to get user info
    const command = `${containerCmd} run --rm -it ${image} id`;
    console.log(`📋 Running command: ${command}`);
    
    const output = execSync(command, { encoding: 'utf8', timeout: 30000 }).trim();
    console.log(`📋 Command output: ${output}`);
    
    // Parse the id command output: uid=1000(mysql) gid=1000(mysql) groups=1000(mysql)
    const uidMatch = output.match(/uid=(\d+)(?:\(([^)]*)\))?/);
    const gidMatch = output.match(/gid=(\d+)(?:\(([^)]*)\))?/);
    
    if (!uidMatch || !gidMatch) {
      throw new Error('Unable to parse user information from container output');
    }
    
    const userInfo = {
      uid: uidMatch[1],
      gid: gidMatch[1],
      user: uidMatch[2] || 'unknown'
    };
    
    console.log(`✅ Container user info for ${image}:`, userInfo);
    
    res.json(userInfo);
    
  } catch (error) {
    console.error(`❌ Container user info error: ${error.message}`);
    res.status(500).json({
      error: 'Container User Info Error',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const isDockerSocket = DOCKER_SOCKET.includes('docker.sock');
    // cspell:ignore libpod
    const infoPath = isDockerSocket ? '/v1.41/info' : '/v4.0.0/libpod/info';
    
    const response = await makeUnixSocketRequest(
      DOCKER_SOCKET,
      'GET',
      infoPath,
      '',
      { 'Content-Type': 'application/json' }
    );

    if (response.statusCode === 200) {
      const info = JSON.parse(response.body);
      res.json({
        status: 'healthy',
        docker: {
          version: info.version?.Version || info.ServerVersion || 'unknown',
          socketPath: DOCKER_SOCKET,
          apiVersion: info.version?.APIVersion || info.ApiVersion || 'unknown'
        }
      });
    } else {
      throw new Error(`Docker/Podman returned status ${response.statusCode}`);
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      socketPath: DOCKER_SOCKET
    });
  }
});

// Configuration API endpoints
app.get('/api/config/server', (_req, res) => {
  res.json(serverConfig);
});

app.get('/api/config/templates', (_req, res) => {
  res.json(templatesConfig);
});

app.put('/api/config/server', (req, res) => {
  try {
    const updatedConfig = { ...serverConfig, ...req.body };
    const configPath = path.join(__dirname, 'config.server.json');
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    serverConfig = updatedConfig;
    console.log('✅ Updated server configuration');
    res.json({ success: true, message: 'Server configuration updated' });
  } catch (error) {
    console.error('❌ Error updating server config:', error.message);
    res.status(500).json({ error: 'Failed to update server configuration' });
  }
});

app.put('/api/config/templates', (req, res) => {
  try {
    const updatedConfig = { ...templatesConfig, ...req.body };
    const configPath = path.join(__dirname, 'config.templates.json');
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    templatesConfig = updatedConfig;
    console.log('✅ Updated templates configuration');
    res.json({ success: true, message: 'Templates configuration updated' });
  } catch (error) {
    console.error('❌ Error updating templates config:', error.message);
    res.status(500).json({ error: 'Failed to update templates configuration' });
  }
});

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    service: 'Database Manager - Docker/Podman Proxy',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      dockerProxy: '/api/podman/*',
      filesystem: '/api/filesystem?path=/path/to/browse',
      configServer: '/api/config/server',
      configTemplates: '/api/config/templates'
    },
    socketPath: DOCKER_SOCKET
  });
});

// Serve static files in production
if (NODE_ENV === 'production') {
  // Serve the built React app
  app.use(express.static(path.join(process.cwd(), 'dist')));
  
  // Handle React router - send all non-API requests to index.html
  app.get('*', (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
  });
}

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`🚀 Database Manager ${NODE_ENV} server running on http://${HOST}:${PORT}`);
  console.log(`🔗 Proxying requests to Docker/Podman socket: ${DOCKER_SOCKET}`);
  console.log(`🌐 CORS configured for ${NODE_ENV} environment`);
  console.log(`📋 Health check available at: http://${HOST}:${PORT}/health`);
  
  if (NODE_ENV === 'production') {
    console.log(`📱 Web interface available at: http://${HOST}:${PORT}`);
  }
});

