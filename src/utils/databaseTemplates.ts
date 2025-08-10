import { DatabaseTemplate } from '../types'
import { configService } from '../services/config'

// Default templates (fallback if config can't be loaded)
const defaultTemplates: DatabaseTemplate[] = [
  {
    type: 'mariadb',
    name: 'MariaDB',
    description: 'Popular MySQL-compatible relational database',
    defaultVersion: 'latest',
    availableVersions: [
      { displayName: 'latest', containerTag: 'latest', containerTagUBI: 'verylatest-ubi' },
      { displayName: '11.2', containerTag: '11.2', containerTagUBI: '11.2-ubi' },
      { displayName: '11.1', containerTag: '11.1', containerTagUBI: '11.1-ubi' },
      { displayName: '11.0', containerTag: '11.0', containerTagUBI: '11.0-ubi' },
      { displayName: '10.11', containerTag: '10.11', containerTagUBI: '10.11-ubi' },
      { displayName: '10.6', containerTag: '10.6', containerTagUBI: '10.6-ubi' },
    ],
    defaultPort: 3306,
    icon: '🗄️',
    imageRepository: 'quay.io/mariadb-foundation/mariadb-devel',
    environmentVariables: [
      {
        key: 'MYSQL_ROOT_PASSWORD',
        label: 'Root Password',
        description: 'Password for the MySQL root user',
        required: true,
        type: 'password',
      },
      {
        key: 'MYSQL_DATABASE',
        label: 'Database Name',
        description: 'Name of the initial database to create',
        required: false,
        type: 'string',
      },
      {
        key: 'MYSQL_USER',
        label: 'Username',
        description: 'Additional user to create',
        required: false,
        type: 'string',
      },
      {
        key: 'MYSQL_PASSWORD',
        label: 'User Password',
        description: 'Password for the additional user',
        required: false,
        type: 'password',
      },
    ],
  },
  {
    type: 'postgresql',
    name: 'PostgreSQL',
    description: 'Advanced open-source relational database',
    defaultVersion: 'latest',
    availableVersions: [
      { displayName: 'latest', containerTag: 'latest', containerTagUBI: 'latest-ubi' },
      { displayName: '16', containerTag: '16', containerTagUBI: '16-ubi' },
      { displayName: '15', containerTag: '15', containerTagUBI: '15-ubi' },
      { displayName: '14', containerTag: '14', containerTagUBI: '14-ubi' },
      { displayName: '13', containerTag: '13', containerTagUBI: '13-ubi' },
      { displayName: '12', containerTag: '12', containerTagUBI: '12-ubi' },
    ],
    defaultPort: 5432,
    icon: '🐘',
    imageRepository: 'postgres',
    environmentVariables: [
      {
        key: 'POSTGRES_PASSWORD',
        label: 'Root Password',
        description: 'Password for the PostgreSQL superuser',
        required: true,
        type: 'password',
      },
      {
        key: 'POSTGRES_DB',
        label: 'Database Name',
        description: 'Name of the initial database to create',
        required: false,
        type: 'string',
      },
      {
        key: 'POSTGRES_USER',
        label: 'Username',
        description: 'PostgreSQL superuser name (default: postgres)',
        required: false,
        type: 'string',
        defaultValue: 'postgres',
      },
    ],
  },
]

// Export templates that will be populated from config
export let databaseTemplates: DatabaseTemplate[] = defaultTemplates

// Load templates from configuration
export async function loadDatabaseTemplates(): Promise<DatabaseTemplate[]> {
  try {
    const templates = await configService.getDatabaseTemplates()
    if (templates && templates.length > 0) {
      databaseTemplates = templates
      return templates
    }
  } catch (error) {
    console.error('Failed to load database templates from config:', error)
  }
  // Return default templates if config loading fails
  databaseTemplates = defaultTemplates
  return defaultTemplates
}

// Initialize templates on module load
loadDatabaseTemplates().catch(console.error)

export function getDatabaseTemplate(type: string): DatabaseTemplate | undefined {
  return databaseTemplates.find(template => template.type === type)
}

export function generateRandomPassword(length = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password
}

export function validateDatabaseName(name: string): string | null {
  if (!name) return 'Database name is required'
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    return 'Database name must start with a letter and contain only letters, numbers, hyphens, and underscores'
  }
  if (name.length > 50) return 'Database name must be 50 characters or less'
  return null
}

export function validatePort(port: number): string | null {
  if (port < 1024 || port > 65535) {
    return 'Port must be between 1024 and 65535'
  }
  return null
}

export function formatContainerState(state: string): { color: string; label: string } {
  switch (state.toLowerCase()) {
    case 'running':
      return { color: '#22c55e', label: 'Running' }
    case 'stopped':
    case 'exited':
      return { color: '#ef4444', label: 'Stopped' }
    case 'paused':
      return { color: '#f59e0b', label: 'Paused' }
    case 'restarting':
      return { color: '#3b82f6', label: 'Restarting' }
    default:
      return { color: '#6b7280', label: state }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}