import { Container, DatabaseConfig, PodmanInfo } from '../types'

class PodmanService {
  private proxyUrl: string
  private socketPath: string

  constructor(socketPath = '/var/run/docker.sock') {
    this.socketPath = socketPath
    // Use a local proxy server that bridges HTTP requests to Unix socket
    this.proxyUrl = 'http://localhost:3000/api/podman'
  }

  private async fetchFromSocket(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.proxyUrl}${endpoint}`
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
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

  async getImageUserInfo(image: string): Promise<{ uid: string; gid: string; user: string }> {
    try {
      // Use proxy server to run container command to get user info
      const response = await fetch('http://localhost:3000/api/container/user-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image }),
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Failed to get user info: ${errorData.error || response.statusText}`)
      }
      
      const userInfo = await response.json()
      console.log(`📋 Container user info for ${image}:`, userInfo)
      return userInfo
      
    } catch (error) {
      console.error(`Failed to get user info for image ${image}:`, error)
      // Fallback to default user info if we can't determine it
      return { uid: '1000', gid: '1000', user: 'default' }
    }
  }

  private async ensureStoragePathExists(storagePath: string, userInfo?: { uid: string; gid: string; user: string }): Promise<void> {
    try {
      // Check if the directory exists by making a request to the filesystem API
      const checkResponse = await fetch(`http://localhost:3000/api/filesystem/ls?path=${encodeURIComponent(storagePath)}`)
      
      if (checkResponse.ok) {
        // Directory exists, we're good to go
        console.log(`✓ Storage path exists: ${storagePath}`)
        return
      }
      
      // Directory doesn't exist, need to create it
      console.log(`📁 Creating storage directory: ${storagePath}`)
      
      // Extract parent path and directory name
      const pathParts = storagePath.split('/').filter(part => part.length > 0)
      const dirName = pathParts.pop() || 'data'
      const parentPath = '/' + pathParts.join('/')
      
      // Prepare the mkdir request body
      const mkdirBody: any = {
        path: parentPath,
        name: dirName,
        mode: '755'  // Standard directory permissions
      }
      
      // Set ownership if user info is provided
      if (userInfo) {
        mkdirBody.owner = userInfo.uid
        mkdirBody.group = userInfo.gid
        console.log(`👤 Setting directory ownership to ${userInfo.uid}:${userInfo.gid} (${userInfo.user})`)
      }
      
      // Create the directory using the proxy-server mkdir endpoint
      const createResponse = await fetch('http://localhost:3000/api/filesystem/mkdir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mkdirBody),
      })
      
      if (!createResponse.ok) {
        const errorData = await createResponse.json()
        
        // If the error is that the directory already exists, that's fine
        if (createResponse.status === 409 && errorData.error?.includes('already exists')) {
          console.log(`✓ Storage path already exists: ${storagePath}`)
          return
        }
        
        throw new Error(`Failed to create storage directory: ${errorData.error || createResponse.statusText}`)
      }
      
      console.log(`✓ Created storage directory: ${storagePath}`)
      
    } catch (error) {
      console.error(`Failed to ensure storage path exists: ${error}`)
      throw new Error(`Failed to create storage directory ${storagePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async deployDatabase(config: DatabaseConfig): Promise<{ containerId: string }> {
    const image = `${config.imageRepository}:${config.version}`
    
    // Pull image first
    await this.pullImage(image)
    
    // Get container user information after pulling the image
    const userInfo = await this.getImageUserInfo(image)
    
    // If persistent storage is enabled, ensure the storage path exists with proper ownership
    if (config.persistentStorage && config.storagePath) {
      await this.ensureStoragePathExists(config.storagePath, userInfo)
    }
    
    const containerConfig = this.buildContainerConfig(config)
    
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
      timestamps: 'true',
      details: 'true',
      multi: 'true'
    })
    
    const response = await this.fetchFromSocket(`/containers/${id}/logs?${params}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch container logs: ${response.status} ${response.statusText}`)
    }
    
    // According to libpod API spec, logs are streamed as binary data in the response body
    // The format is Docker's multiplexed stream format with 8-byte headers
    const arrayBuffer = await response.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    const processedLines: string[] = []
    let offset = 0
    
    while (offset < uint8Array.length) {
      // Check if we have at least 8 bytes for the header
      if (offset + 8 > uint8Array.length) {
        // Not enough bytes for header, treat remaining as plain text
        const remaining = new TextDecoder('utf-8').decode(uint8Array.subarray(offset))
        const lines = remaining.split('\n').filter(line => line.trim())
        processedLines.push(...lines)
        break
      }
      
      // Read the 8-byte header
      const streamType = uint8Array[offset]     // 0=stdin, 1=stdout, 2=stderr
      // bytes 1-3 are padding (should be 0)
      const payloadSize = (uint8Array[offset + 4] << 24) | 
                         (uint8Array[offset + 5] << 16) | 
                         (uint8Array[offset + 6] << 8) | 
                         uint8Array[offset + 7]
      
      // Validate header
      if (streamType > 2 || payloadSize <= 0 || payloadSize > uint8Array.length - offset - 8) {
        // Invalid header, treat remaining data as plain text
        const remaining = new TextDecoder('utf-8').decode(uint8Array.subarray(offset))
        const lines = remaining.split('\n').filter(line => line.trim())
        processedLines.push(...lines)
        break
      }
      
      // Read the payload
      offset += 8
      const payloadBytes = uint8Array.subarray(offset, offset + payloadSize)
      const payload = new TextDecoder('utf-8').decode(payloadBytes)
      
      // Split payload into lines and add to result
      const lines = payload.split('\n').filter(line => line.trim())
      processedLines.push(...lines)
      
      offset += payloadSize
    }
    
    // If no processed lines, try fallback plain text processing
    if (processedLines.length === 0) {
      const plainText = new TextDecoder('utf-8').decode(uint8Array)
      const lines = plainText.split('\n').filter(line => line.trim())
      processedLines.push(...lines)
    }
    
    return processedLines.join('\n')
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