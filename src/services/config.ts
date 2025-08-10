import { DatabaseTemplate } from '../types'

interface ServerConfig {
  server: {
    port: number
    host: string
    cors: {
      enabled: boolean
      origins: string[]
    }
  }
  frontend: {
    port: number
    host: string
  }
  containerSocket: {
    autoDetect: boolean
    dockerPath: string
    podmanPath: string
    preferredRuntime: string
  }
  storage: {
    defaultBasePath: string
    createIfNotExists: boolean
    defaultPermissions: {
      uid: number
      gid: number
      mode: string
    }
  }
  logging: {
    enabled: boolean
    logFile: string
    logLevel: string
    consoleOutput: boolean
  }
  security: {
    allowedOperations: Record<string, boolean>
    trustedImages: {
      enabled: boolean
      registries: string[]
    }
  }
  features: {
    enableMetrics: boolean
    enableHealthCheck: boolean
    enableWebUI: boolean
    enableAPIOnly: boolean
  }
}

interface TemplatesConfig {
  templates: DatabaseTemplate[]
  customTemplates: DatabaseTemplate[]
  settings: {
    allowCustomTemplates: boolean
    validateImages: boolean
    defaultStoragePath: string
    passwordPolicy: {
      minLength: number
      requireUppercase: boolean
      requireLowercase: boolean
      requireNumbers: boolean
      requireSpecialChars: boolean
    }
  }
}

class ConfigService {
  private serverConfig: ServerConfig | null = null
  private templatesConfig: TemplatesConfig | null = null
  private configCache = new Map<string, any>()

  async loadServerConfig(): Promise<ServerConfig> {
    if (this.serverConfig) {
      return this.serverConfig
    }

    try {
      const response = await fetch('/api/config/server')
      if (!response.ok) {
        throw new Error('Failed to load server configuration')
      }
      this.serverConfig = await response.json()
      return this.serverConfig!
    } catch (error) {
      console.error('Error loading server config:', error)
      // Return default configuration
      return this.getDefaultServerConfig()
    }
  }

  async loadTemplatesConfig(): Promise<TemplatesConfig> {
    if (this.templatesConfig) {
      return this.templatesConfig
    }

    try {
      const response = await fetch('/api/config/templates')
      if (!response.ok) {
        throw new Error('Failed to load templates configuration')
      }
      this.templatesConfig = await response.json()
      return this.templatesConfig!
    } catch (error) {
      console.error('Error loading templates config:', error)
      // Return default configuration
      return this.getDefaultTemplatesConfig()
    }
  }

  async saveServerConfig(config: Partial<ServerConfig>): Promise<void> {
    try {
      const response = await fetch('/api/config/server', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      })

      if (!response.ok) {
        throw new Error('Failed to save server configuration')
      }

      // Update cached config
      this.serverConfig = { ...this.serverConfig, ...config } as ServerConfig
    } catch (error) {
      console.error('Error saving server config:', error)
      throw error
    }
  }

  async saveTemplatesConfig(config: Partial<TemplatesConfig>): Promise<void> {
    try {
      const response = await fetch('/api/config/templates', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      })

      if (!response.ok) {
        throw new Error('Failed to save templates configuration')
      }

      // Update cached config
      this.templatesConfig = { ...this.templatesConfig, ...config } as TemplatesConfig
    } catch (error) {
      console.error('Error saving templates config:', error)
      throw error
    }
  }

  async getDatabaseTemplates(): Promise<DatabaseTemplate[]> {
    const config = await this.loadTemplatesConfig()
    return [...config.templates, ...config.customTemplates]
  }

  async addCustomTemplate(template: DatabaseTemplate): Promise<void> {
    const config = await this.loadTemplatesConfig()
    config.customTemplates.push(template)
    await this.saveTemplatesConfig({ customTemplates: config.customTemplates })
  }

  async removeCustomTemplate(templateType: string): Promise<void> {
    const config = await this.loadTemplatesConfig()
    config.customTemplates = config.customTemplates.filter(t => t.type !== templateType)
    await this.saveTemplatesConfig({ customTemplates: config.customTemplates })
  }

  async getStorageSettings() {
    const serverConfig = await this.loadServerConfig()
    const templatesConfig = await this.loadTemplatesConfig()
    
    return {
      defaultBasePath: serverConfig.storage.defaultBasePath,
      createIfNotExists: serverConfig.storage.createIfNotExists,
      defaultPermissions: serverConfig.storage.defaultPermissions,
      defaultStoragePath: templatesConfig.settings.defaultStoragePath,
    }
  }

  private getDefaultServerConfig(): ServerConfig {
    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
        cors: {
          enabled: true,
          origins: ['http://localhost:5173', 'http://localhost:8080']
        }
      },
      frontend: {
        port: 5173,
        host: 'localhost'
      },
      containerSocket: {
        autoDetect: true,
        dockerPath: '/var/run/docker.sock',
        podmanPath: '/var/run/podman.sock',
        preferredRuntime: 'auto'
      },
      storage: {
        defaultBasePath: '/opt/db-data',
        createIfNotExists: true,
        defaultPermissions: {
          uid: 999,
          gid: 999,
          mode: '0700'
        }
      },
      logging: {
        enabled: true,
        logFile: 'proxy-server.log',
        logLevel: 'info',
        consoleOutput: true
      },
      security: {
        allowedOperations: {
          createContainer: true,
          removeContainer: true,
          startContainer: true,
          stopContainer: true,
          inspectContainer: true,
          listContainers: true,
          executiveCommands: false
        },
        trustedImages: {
          enabled: false,
          registries: ['docker.io', 'quay.io', 'registry.access.redhat.com']
        }
      },
      features: {
        enableMetrics: false,
        enableHealthCheck: true,
        enableWebUI: true,
        enableAPIOnly: false
      }
    }
  }

  private getDefaultTemplatesConfig(): TemplatesConfig {
    // Import the default templates from the existing file
    // This will be used as fallback if the config file can't be loaded
    return {
      templates: [],
      customTemplates: [],
      settings: {
        allowCustomTemplates: true,
        validateImages: true,
        defaultStoragePath: '/opt/db-data',
        passwordPolicy: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true
        }
      }
    }
  }

  // Clear all cached configurations
  clearCache(): void {
    this.serverConfig = null
    this.templatesConfig = null
    this.configCache.clear()
  }
}

// Export singleton instance
export const configService = new ConfigService()

// Export types
export type { ServerConfig, TemplatesConfig }