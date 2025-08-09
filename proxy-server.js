#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import http from 'http';
import net from 'net';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Configure CORS based on environment
const corsOptions = NODE_ENV === 'production' 
  ? {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
      credentials: true
    }
  : {
      origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
      credentials: true
    };

// Enable CORS
app.use(cors(corsOptions));

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
      responseData += data.toString();
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

    // Handle streaming responses (like image pulls)
    if (response.headers['content-type']?.includes('application/json') && response.body) {
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
    const { path: dirPath, name } = req.body;
    
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
    res.json({ 
      success: true, 
      path: newDirPath,
      message: `Directory '${name}' created successfully`
    });
    
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

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const isDockerSocket = DOCKER_SOCKET.includes('docker.sock');
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Database Manager - Docker/Podman Proxy',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      dockerProxy: '/api/podman/*',
      filesystem: '/api/filesystem?path=/path/to/browse'
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down proxy server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down proxy server...');
  process.exit(0);
});