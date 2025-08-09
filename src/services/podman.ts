import { Container, DatabaseConfig, PodmanInfo } from '../types'

class PodmanService {
  private proxyUrl: string
  private socketPath: string

  constructor(socketPath = '/var/run/docker.sock') {
    this.socketPath = socketPath
    // Use a local proxy server that bridges HTTP requests to Unix socket
    this.proxyUrl = 'http://localhost:3001/api/podman'
  }

  private async fetchFromSocket(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.proxyUrl}${endpoint}`
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Socket-Path': this.socketPath,
          ...options.headers,
        },
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Podman API error: ${response.status} ${response.statusText} - ${errorText}`)
      }
      
      return response
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Unable to connect to Podman proxy server at ${this.proxyUrl}. Make sure the proxy server is running and Podman socket is accessible at ${this.socketPath}.`)
      }
      throw error
    }
  }

  async getInfo(): Promise<PodmanInfo> {
    const response = await this.fetchFromSocket('/info')
    return response.json()
  }

  async listContainers(all = false): Promise<Container[]> {
    const params = new URLSearchParams({ all: all.toString() })
    const response = await this.fetchFromSocket(`/containers/json?${params}`)
    const rawContainers = await response.json()
    
    // Map Docker API response to our Container interface
    return rawContainers.map((container: any) => ({
      id: container.Id || container.id,
      name: container.Name || container.name || container.Names?.[0] || 'Unnamed',
      image: container.Image || container.image,
      state: (container.State || container.state)?.toLowerCase(),
      status: container.Status || container.status,
      ports: container.Ports || container.ports || [],
      created: container.Created || container.created,
      labels: container.Labels || container.labels || {},
      mounts: container.Mounts || container.mounts || [],
      networkSettings: container.NetworkSettings || container.networkSettings || { networks: {} },
      // Keep original fields for backwards compatibility
      names: container.Names || container.names,
    }))
  }

  async getContainer(id: string): Promise<Container> {
    const response = await this.fetchFromSocket(`/containers/${id}/json`)
    return response.json()
  }

  async createContainer(config: any): Promise<{ id: string; warnings: string[] }> {
    const isDockerSocket = this.socketPath.includes('docker.sock')
    let endpoint = '/containers/create'
    let requestBody = config
    
    if (isDockerSocket && config.name) {
      // Docker API expects container name as query parameter
      endpoint = `/containers/create?name=${encodeURIComponent(config.name)}`
      // Remove name from request body for Docker
      const { name, ...bodyConfig } = config
      requestBody = bodyConfig
    }
    
    const response = await this.fetchFromSocket(endpoint, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
    const result = await response.json()
    
    // Handle different API response formats between Docker and Podman
    if (isDockerSocket) {
      // Docker API returns { "Id": "container_id", "Warnings": [...] }
      return {
        id: result.Id || result.id,
        warnings: result.Warnings || result.warnings || []
      }
    } else {
      // Podman API returns { "id": "container_id", "warnings": [...] }
      return {
        id: result.id || result.Id,
        warnings: result.warnings || result.Warnings || []
      }
    }
  }

  async startContainer(id: string): Promise<void> {
    await this.fetchFromSocket(`/containers/${id}/start`, {
      method: 'POST',
    })
  }

  async stopContainer(id: string): Promise<void> {
    await this.fetchFromSocket(`/containers/${id}/stop`, {
      method: 'POST',
    })
  }

  async restartContainer(id: string): Promise<void> {
    await this.fetchFromSocket(`/containers/${id}/restart`, {
      method: 'POST',
    })
  }

  async removeContainer(id: string, force = false): Promise<void> {
    const params = new URLSearchParams({ force: force.toString() })
    await this.fetchFromSocket(`/containers/${id}?${params}`, {
      method: 'DELETE',
    })
  }

  async pullImage(image: string): Promise<void> {
    const isDockerSocket = this.socketPath.includes('docker.sock')
    let endpoint: string
    
    if (isDockerSocket) {
      // Docker API format
      const params = new URLSearchParams({ fromImage: image })
      endpoint = `/images/create?${params}`
    } else {
      // Podman API format
      const params = new URLSearchParams({ reference: image })
      endpoint = `/images/pull?${params}`
    }
    
    const response = await this.fetchFromSocket(endpoint, {
      method: 'POST',
    })
    
    // Handle streaming response for pull progress
    if (response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value, { stream: true })
        // Log progress or emit events for UI feedback
        console.log('Pull progress:', chunk)
      }
    }
  }

  async deployDatabase(config: DatabaseConfig): Promise<{ containerId: string }> {
    const containerConfig = this.buildContainerConfig(config)
    
    // Pull image first
    const image = `${config.imageRepository}:${config.version}`
    await this.pullImage(image)
    
    // Create container
    const result = await this.createContainer(containerConfig)
    
    // Start container
    await this.startContainer(result.id)
    
    return { containerId: result.id }
  }

  private buildContainerConfig(config: DatabaseConfig): any {
    const image = `${config.imageRepository}:${config.version}`
    const containerName = `db-${config.type}-${config.name}`
    
    // Get the default container port based on database type
    const containerPort = config.type === 'mariadb' ? 3306 : 5432
    // Use the user-specified port as the host port
    const hostPort = config.port
    
    const env = [
      ...(config.type === 'mariadb' ? [
        `MYSQL_ROOT_PASSWORD=${config.rootPassword}`,
        ...(config.database ? [`MYSQL_DATABASE=${config.database}`] : []),
        ...(config.username ? [`MYSQL_USER=${config.username}`] : []),
        ...(config.password ? [`MYSQL_PASSWORD=${config.password}`] : []),
      ] : [
        `POSTGRES_PASSWORD=${config.rootPassword}`,
        ...(config.database ? [`POSTGRES_DB=${config.database}`] : []),
        ...(config.username ? [`POSTGRES_USER=${config.username}`] : []),
      ]),
      ...Object.entries(config.environment || {}).map(([key, value]) => `${key}=${value}`),
    ]

    const portBindings: Record<string, Array<{ HostPort: string }>> = {}
    portBindings[`${containerPort}/tcp`] = [{ HostPort: hostPort.toString() }]

    const hostConfig: any = {
      PortBindings: portBindings,
    }

    if (config.persistentStorage && config.storagePath) {
      const dataDir = config.type === 'mariadb' ? '/var/lib/mysql' : '/var/lib/postgresql/data'
      // Remove SELinux context (Z) flag for Docker compatibility
      hostConfig.Binds = [`${config.storagePath}:${dataDir}`]
    }

    // Docker API format - note the difference in naming convention
    const isDockerSocket = this.socketPath.includes('docker.sock')
    
    if (isDockerSocket) {
      // Docker API format - name is passed as query parameter, not in body
      return {
        Image: image,
        name: containerName,  // This will be removed in createContainer method
        Env: env,
        ExposedPorts: {
          [`${containerPort}/tcp`]: {}
        },
        HostConfig: hostConfig,
        Labels: {
          'db-manager.database-type': config.type,
          'db-manager.database-name': config.name,
          'db-manager.database-port': hostPort.toString(),
          'db-manager.managed': 'true',
        },
      }
    } else {
      // Podman libpod API format 
      return {
        Image: image,
        Name: containerName,  // Podman expects capitalized 'Name'
        Env: env,
        ExposedPorts: {
          [`${containerPort}/tcp`]: {}
        },
        HostConfig: hostConfig,
        Labels: {
          'db-manager.database-type': config.type,
          'db-manager.database-name': config.name,
          'db-manager.database-port': hostPort.toString(),
          'db-manager.managed': 'true',
        },
      }
    }
  }

  async getDatabaseContainers(): Promise<Container[]> {
    const containers = await this.listContainers(true)
    return containers.filter(container => 
      container.labels && container.labels['db-manager.managed'] == 'true'
    )
  }

  async getAllContainers(): Promise<Container[]> {
    return this.listContainers(true)
  }

  isManagedContainer(container: Container): boolean {
    return !!(container.labels && container.labels['db-manager.managed'] === 'true')
  }

  isDatabaseContainer(container: Container): boolean {
    return this.isManagedContainer(container) && !!(container.labels && container.labels['db-manager.database-type'])
  }

  async getContainerLogs(id: string, tail = 100): Promise<string> {
    const params = new URLSearchParams({
      stdout: 'true',
      stderr: 'true',
      tail: tail.toString(),
    })
    
    const response = await this.fetchFromSocket(`/containers/${id}/logs?${params}`)
    return response.text()
  }

  async getContainerStats(id: string): Promise<any> {
    const response = await this.fetchFromSocket(`/containers/${id}/stats?stream=false`)
    return response.json()
  }

  // Method to configure different socket paths
  setSocketPath(socketPath: string): void {
    this.socketPath = socketPath
  }

  // Method to configure proxy URL for different environments
  setProxyUrl(proxyUrl: string): void {
    this.proxyUrl = proxyUrl
  }
}

export const podmanService = new PodmanService()
export default PodmanService