import { useState, useEffect } from 'react'
import { DatabaseTemplate } from '../types'
import { configService } from '../services/config'
import { loadDatabaseTemplates, databaseTemplates } from '../utils/databaseTemplates'

export function useDatabaseTemplates() {
  const [templates, setTemplates] = useState<DatabaseTemplate[]>(databaseTemplates)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setIsLoading(true)
        const loadedTemplates = await loadDatabaseTemplates()
        setTemplates(loadedTemplates)
        setError(null)
      } catch (err) {
        console.error('Error loading database templates:', err)
        setError(err instanceof Error ? err : new Error('Failed to load templates'))
        // Still use default templates on error
        setTemplates(databaseTemplates)
      } finally {
        setIsLoading(false)
      }
    }

    loadTemplates()
  }, [])

  const refreshTemplates = async () => {
    try {
      setIsLoading(true)
      configService.clearCache()
      const loadedTemplates = await loadDatabaseTemplates()
      setTemplates(loadedTemplates)
      setError(null)
    } catch (err) {
      console.error('Error refreshing templates:', err)
      setError(err instanceof Error ? err : new Error('Failed to refresh templates'))
    } finally {
      setIsLoading(false)
    }
  }

  return {
    templates,
    isLoading,
    error,
    refreshTemplates
  }
}

export function useServerConfig() {
  const [config, setConfig] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setIsLoading(true)
        const serverConfig = await configService.loadServerConfig()
        setConfig(serverConfig)
        setError(null)
      } catch (err) {
        console.error('Error loading server config:', err)
        setError(err instanceof Error ? err : new Error('Failed to load config'))
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [])

  const updateConfig = async (updates: any) => {
    try {
      await configService.saveServerConfig(updates)
      setConfig({ ...config, ...updates })
    } catch (err) {
      console.error('Error updating server config:', err)
      throw err
    }
  }

  return {
    config,
    isLoading,
    error,
    updateConfig
  }
}