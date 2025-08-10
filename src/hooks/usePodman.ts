import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { podmanService } from '../services/podman'
import { DatabaseConfig } from '../types'

export function usePodmanInfo() {
  return useQuery({
    queryKey: ['podman-info'],
    queryFn: () => podmanService.getInfo(),
    retry: 2,
    refetchOnWindowFocus: false,
  })
}

export function useContainers() {
  return useQuery({
    queryKey: ['containers'],
    queryFn: () => podmanService.listContainers(true),
    refetchInterval: 5000,
    retry: 2,
  })
}

export function useAllContainers() {
  return useQuery({
    queryKey: ['all-containers'],
    queryFn: () => podmanService.getAllContainers(),
    refetchInterval: 5000,
    retry: 2,
  })
}

export function useDatabaseContainers() {
  return useQuery({
    queryKey: ['database-containers'],
    queryFn: () => podmanService.getDatabaseContainers(),
    refetchInterval: 5000,
    retry: 2,
  })
}

export function useContainer(id: string) {
  return useQuery({
    queryKey: ['container', id],
    queryFn: () => podmanService.getContainer(id),
    enabled: !!id,
    refetchInterval: 5000,
  })
}

export function useContainerLogs(id: string, tail = 100) {
  return useQuery({
    queryKey: ['container-logs', id, tail],
    queryFn: () => podmanService.getContainerLogs(id, tail),
    enabled: !!id,
    refetchOnWindowFocus: false,
  })
}

export function useContainerStats(id: string) {
  return useQuery({
    queryKey: ['container-stats', id],
    queryFn: () => podmanService.getContainerStats(id),
    enabled: !!id,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  })
}

export function useDeployDatabase() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (config: DatabaseConfig) => podmanService.deployDatabase(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] })
      queryClient.invalidateQueries({ queryKey: ['all-containers'] })
      queryClient.invalidateQueries({ queryKey: ['database-containers'] })
    },
  })
}

export function useStartContainer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => podmanService.startContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] })
      queryClient.invalidateQueries({ queryKey: ['all-containers'] })
      queryClient.invalidateQueries({ queryKey: ['database-containers'] })
    },
  })
}

export function useStopContainer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => podmanService.stopContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] })
      queryClient.invalidateQueries({ queryKey: ['all-containers'] })
      queryClient.invalidateQueries({ queryKey: ['database-containers'] })
    },
  })
}

export function useRestartContainer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => podmanService.restartContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] })
      queryClient.invalidateQueries({ queryKey: ['all-containers'] })
      queryClient.invalidateQueries({ queryKey: ['database-containers'] })
    },
  })
}

export function useRemoveContainer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) => 
      podmanService.removeContainer(id, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] })
      queryClient.invalidateQueries({ queryKey: ['all-containers'] })
      queryClient.invalidateQueries({ queryKey: ['database-containers'] })
    },
  })
}