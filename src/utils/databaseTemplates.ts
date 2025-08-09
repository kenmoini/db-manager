import { DatabaseTemplate } from '../types'

export const databaseTemplates: DatabaseTemplate[] = [
  {
    type: 'mariadb',
    name: 'MariaDB',
    description: 'Popular MySQL-compatible relational database',
    defaultVersion: 'latest',
    availableVersions: ['latest', '11.2', '11.1', '11.0', '10.11', '10.6'],
    defaultPort: 3306,
    icon: '🗄️',
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
    availableVersions: ['latest', '16', '15', '14', '13', '12'],
    defaultPort: 5432,
    icon: '🐘',
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