export interface Container {
  id: string
  name: string
  image: string
  state: 'running' | 'stopped' | 'paused' | 'restarting'
  status: string
  ports: Port[]
  created: string
  labels: Record<string, string>
  mounts: Mount[]
  networkSettings: NetworkSettings
}

export interface Port {
  privatePort: number
  publicPort?: number
  type: 'tcp' | 'udp'
  ip?: string
}

export interface Mount {
  source: string
  destination: string
  mode: string
  rw: boolean
  propagation: string
}

export interface NetworkSettings {
  networks: Record<string, NetworkInfo>
}

export interface NetworkInfo {
  ipAddress: string
  gateway: string
  macAddress: string
  networkID: string
}

export interface DatabaseConfig {
  type: 'mariadb' | 'postgresql'
  name: string
  version: string
  rootPassword: string
  database?: string
  username?: string
  password?: string
  port: number
  persistentStorage: boolean
  storagePath?: string
  environment?: Record<string, string>
}

export interface DeploymentStatus {
  id: string
  status: 'pending' | 'deploying' | 'running' | 'failed'
  message: string
  progress: number
}

export interface PodmanInfo {
  version: string
  apiVersion: string
  buildahVersion: string
  conmonVersion: string
  ociRuntimeVersion: string
  osArch: string
  os: string
}

export type DatabaseType = 'mariadb' | 'postgresql'

export interface DatabaseTemplate {
  type: DatabaseType
  name: string
  description: string
  defaultVersion: string
  availableVersions: string[]
  defaultPort: number
  icon: string
  environmentVariables: EnvironmentVariable[]
}

export interface EnvironmentVariable {
  key: string
  label: string
  description: string
  required: boolean
  type: 'string' | 'number' | 'boolean' | 'password'
  defaultValue?: string
}