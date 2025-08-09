import { useState } from 'react'
import {
  Title,
  Button,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  EmptyState,
  Spinner,
  Alert,
  AlertVariant,
  Modal,
  ModalVariant,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Icon,
  Content,
  ContentVariants
} from '@patternfly/react-core'
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td
} from '@patternfly/react-table'
import {
  PlayIcon,
  StopIcon,
  RedoIcon,
  TrashIcon,
  EyeIcon,
  EllipsisVIcon,
  DatabaseIcon,
  CubeIcon,
  ExclamationTriangleIcon
} from '@patternfly/react-icons'
import { useAllContainers, useStartContainer, useStopContainer, useRestartContainer, useRemoveContainer } from '../hooks/usePodman'
import { podmanService } from '../services/podman'
import { formatContainerState } from '../utils/databaseTemplates'
import ContainerDetails from './ContainerDetails'

export default function ContainerList() {
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null)
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null)
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({})
  
  const { data: containers, isLoading, error } = useAllContainers()
  const startMutation = useStartContainer()
  const stopMutation = useStopContainer()
  const restartMutation = useRestartContainer()
  const removeMutation = useRemoveContainer()

  const handleStart = (id: string) => {
    startMutation.mutate(id)
  }

  const handleStop = (id: string) => {
    stopMutation.mutate(id)
  }

  const handleRestart = (id: string) => {
    restartMutation.mutate(id)
  }

  const handleRemove = (id: string, force = false) => {
    removeMutation.mutate({ id, force }, {
      onSuccess: () => {
        setShowConfirmDelete(null)
        if (selectedContainerId === id) {
          setSelectedContainerId(null)
        }
      }
    })
  }

  const toggleDropdown = (id: string) => {
    setOpenDropdowns(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const formatDate = (dateString: string) => {
    try {
      // Handle different date formats from Docker/Podman APIs
      let date: Date;
      
      // Check if it's a Unix timestamp (number as string)
      const timestamp = parseInt(dateString);
      if (!isNaN(timestamp) && timestamp > 0) {
        // If the timestamp appears to be in seconds (typical Unix timestamp),
        // convert to milliseconds for JavaScript Date
        if (timestamp < 10000000000) { // Less than year 2286 in seconds
          date = new Date(timestamp * 1000);
        } else {
          // Already in milliseconds
          date = new Date(timestamp);
        }
      } else {
        // Try parsing as ISO string or other date format
        date = new Date(dateString);
      }
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      return date.toLocaleString();
    } catch (error) {
      console.warn('Error formatting date:', dateString, error);
      return 'Invalid date';
    }
  }

  const getDatabaseType = (container: any) => {
    return container.labels?.['db-manager.database-type'] || 'unknown'
  }

  const getDatabaseName = (container: any) => {
    const managedName = container.labels?.['db-manager.database-name']
    if (managedName) return managedName
    
    const containerName = container.name || container.names?.[0]
    return containerName || 'Unnamed'
  }

  const getContainerDisplayName = (container: any) => {
    try {
      if (podmanService.isManagedContainer(container)) {
        return getDatabaseName(container)
      }
      return container.names?.[0]?.replace(/^\//, '') || container.name || 'Unnamed'
    } catch (error) {
      console.warn('Error getting container display name:', error)
      return container.name || container.names?.[0] || 'Unnamed'
    }
  }

  const getContainerType = (container: any) => {
    try {
      if (podmanService.isDatabaseContainer(container)) {
        const dbType = getDatabaseType(container)
        return dbType.charAt(0).toUpperCase() + dbType.slice(1)
      }
      // Try to infer type from image name
      const image = container.image || ''
      if (image.includes('postgres')) return 'PostgreSQL'
      if (image.includes('mariadb') || image.includes('mysql')) return 'MariaDB'
      if (image.includes('nginx')) return 'Web Server'
      if (image.includes('redis')) return 'Cache'
      return 'Container'
    } catch (error) {
      console.warn('Error getting container type:', error)
      return 'Container'
    }
  }

  const getContainerIcon = (container: any) => {
    try {
      if (podmanService.isDatabaseContainer(container)) {
        const dbType = getDatabaseType(container)
        return dbType === 'mariadb' ? '🗄️' : '🐘'
      }
      // Generic icon for non-database containers
      return '📦'
    } catch (error) {
      console.warn('Error getting container icon:', error)
      return '📦'
    }
  }

  const getStatusColor = (state: string): 'blue' | 'green' | 'red' | 'orange' | 'grey' => {
    switch (state.toLowerCase()) {
      case 'running':
        return 'green'
      case 'stopped':
      case 'exited':
        return 'red'
      case 'paused':
        return 'orange'
      case 'restarting':
        return 'blue'
      default:
        return 'grey'
    }
  }

  const renderActionButtons = (container: any) => {
    const isRunning = container.state === 'running'
    const isPending = startMutation.isPending || stopMutation.isPending || restartMutation.isPending
    const isManaged = podmanService.isManagedContainer(container)
    
    return (
      <Flex gap={{ default: 'gapSm' }}>
        <FlexItem>
          {isRunning ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<StopIcon />}
              onClick={() => handleStop(container.id)}
              isDisabled={isPending}
            >
              Stop
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={<PlayIcon />}
              onClick={() => handleStart(container.id)}
              isDisabled={isPending}
            >
              Start
            </Button>
          )}
        </FlexItem>
        <FlexItem>
          <Dropdown
            isOpen={openDropdowns[container.id] || false}
            onSelect={() => setOpenDropdowns(prev => ({ ...prev, [container.id]: false }))}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle
                ref={toggleRef}
                variant="plain"
                onClick={() => toggleDropdown(container.id)}
                isExpanded={openDropdowns[container.id] || false}
              >
                <EllipsisVIcon />
              </MenuToggle>
            )}
          >
            <DropdownList>
              <DropdownItem
                key="restart"
                icon={<RedoIcon />}
                onClick={() => handleRestart(container.id)}
                isDisabled={isPending}
              >
                Restart
              </DropdownItem>
              <DropdownItem
                key="view"
                icon={<EyeIcon />}
                onClick={() => setSelectedContainerId(container.id)}
              >
                View Details
              </DropdownItem>
              {isManaged && (
                <DropdownItem
                  key="delete"
                  icon={<TrashIcon />}
                  onClick={() => setShowConfirmDelete(container.id)}
                >
                  Delete
                </DropdownItem>
              )}
              {!isManaged && (
                <DropdownItem
                  key="info"
                  icon={<CubeIcon />}
                  isDisabled
                >
                  Not Managed
                </DropdownItem>
              )}
            </DropdownList>
          </Dropdown>
        </FlexItem>
      </Flex>
    )
  }

  if (isLoading) {
    return (
      <EmptyState>
        <Spinner />
        <Title headingLevel="h2" size="lg">
          Loading databases...
        </Title>
      </EmptyState>
    )
  }

  if (error) {
    return (
      <EmptyState>
        <ExclamationTriangleIcon />
        <Title headingLevel="h2" size="lg">
          Unable to load databases
        </Title>
        <Alert variant={AlertVariant.danger} title="Connection Error" isInline>
          {error.message}
        </Alert>
        <br />
        <Content>Make sure Podman is running and accessible.</Content>
      </EmptyState>
    )
  }

  // Separate containers into managed and other running containers
  const managedContainers = containers?.filter(container => {
    try {
      return podmanService.isManagedContainer(container)
    } catch (error) {
      console.warn('Error checking if container is managed:', error)
      return false
    }
  }) || []
  
  const otherRunningContainers = containers?.filter(container => {
    try {
      const isManaged = podmanService.isManagedContainer(container)
      const isRunning = container.state === 'running'
      return !isManaged && isRunning
    } catch (error) {
      console.warn('Error checking container status:', error)
      return false
    }
  }) || []

  if (!containers || containers.length === 0) {
    return (
      <EmptyState>
        <DatabaseIcon />
        <Title headingLevel="h2" size="lg">
          No containers found
        </Title>
        <Content>
          Deploy your first database using the "Deploy Database" section.
        </Content>
      </EmptyState>
    )
  }

  if (selectedContainerId) {
    const selectedContainer = containers.find(c => c.id === selectedContainerId)
    if (selectedContainer) {
      return (
        <ContainerDetails 
          container={selectedContainer}
          onBack={() => setSelectedContainerId(null)}
        />
      )
    }
  }

  const renderContainerTable = (containerList: any[], title: string, emptyMessage: string, showActions = true) => {
    if (containerList.length === 0) {
      return (
        <FlexItem>
          <EmptyState variant="sm">
            <CubeIcon />
            <Title headingLevel="h4" size="md">
              {emptyMessage}
            </Title>
          </EmptyState>
        </FlexItem>
      )
    }

    return (
      <FlexItem>
        <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
          <FlexItem>
            <Toolbar>
              <ToolbarContent>
                <ToolbarItem>
                  <Title headingLevel="h3" size="lg">
                    {title}
                  </Title>
                </ToolbarItem>
                <ToolbarItem>
                  <Label color={showActions ? "blue" : "grey"}>
                    <CubeIcon /> {containerList.length} container{containerList.length !== 1 ? 's' : ''}
                  </Label>
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
          </FlexItem>
          <FlexItem>
            <Table 
              aria-label={title} 
              variant="compact" 
              isStriped
              style={{
                border: '1px solid var(--pf-v6-global--BorderColor--default)',
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <Thead>
                <Tr style={{ 
                  backgroundColor: 'var(--pf-v6-global--BackgroundColor--color-200)',
                  borderBottom: '2px solid var(--pf-v6-global--BorderColor--default)'
                }}>
                  <Th 
                    width={40}
                    style={{ 
                      fontSize: '16px', 
                      fontWeight: '600',
                      color: 'var(--pf-v6-global--Color--text--primary--default)',
                      padding: '16px 12px'
                    }}
                  >
                    Container
                  </Th>
                  <Th 
                    width={20}
                    style={{ 
                      fontSize: '16px', 
                      fontWeight: '600',
                      color: 'var(--pf-v6-global--Color--text--primary--default)',
                      padding: '16px 12px'
                    }}
                  >
                    Status
                  </Th>
                  <Th 
                    width={20}
                    style={{ 
                      fontSize: '16px', 
                      fontWeight: '600',
                      color: 'var(--pf-v6-global--Color--text--primary--default)',
                      padding: '16px 12px'
                    }}
                  >
                    Ports
                  </Th>
                  {showActions && (
                    <Th 
                      width={20}
                      style={{ 
                        fontSize: '16px', 
                        fontWeight: '600',
                        color: 'var(--pf-v6-global--Color--text--primary--default)',
                        padding: '16px 12px'
                      }}
                    >
                      Actions
                    </Th>
                  )}
                </Tr>
              </Thead>
              <Tbody>
              {containerList.map((container) => {
            try {
              const state = formatContainerState(container.state)
              const displayName = getContainerDisplayName(container)
              const containerType = getContainerType(container)
              const containerIcon = getContainerIcon(container)
              const isManaged = podmanService.isManagedContainer(container)
              const isDatabase = podmanService.isDatabaseContainer(container)
            
              return (
                <Tr 
                  key={container.id}
                >
                  <Td>
                    <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
                      <FlexItem>
                        <Icon size="xl">
                          <span style={{ fontSize: '32px' }}>
                            {containerIcon}
                          </span>
                        </Icon>
                      </FlexItem>
                      <FlexItem>
                        <Flex direction={{ default: 'column' }} gap={{ default: 'gapXs' }}>
                          <FlexItem>
                            <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                              <FlexItem>
                                <Title headingLevel="h4" size="lg" id={`container-${container.id}`}>
                                  {displayName}
                                </Title>
                              </FlexItem>
                            </Flex>
                          </FlexItem>
                          <FlexItem>
                            <Content component={ContentVariants.small}>
                              {containerType} • {container.image}
                            </Content>
                          </FlexItem>
                        </Flex>
                      </FlexItem>
                    </Flex>
                  </Td>
                  <Td>
                    <Flex direction={{ default: 'column' }} gap={{ default: 'gapXs' }}>
                      <FlexItem>
                        <div className="db-manager-container-state">
                          <Label color={getStatusColor(container.state)}>
                            <span 
                              className="db-manager-status-indicator"
                              style={{marginRight: '10px', backgroundColor: state.color }}
                            />
                            {state.label}
                          </Label>
                        </div>
                      </FlexItem>
                      <FlexItem>
                        <Content component={ContentVariants.small}>
                          Created {formatDate(container.created)}
                        </Content>
                      </FlexItem>
                    </Flex>
                  </Td>
                  <Td>
                            {(() => {
                              // Handle different port data structures from Docker/Podman APIs
                              const ports = container.ports || []
                              
                              if (ports.length === 0) {
                                return (
                                  <Content component={ContentVariants.small}>
                                    No exposed ports
                                  </Content>
                                )
                              }

                              const validPorts = ports.filter(port => {
                                // Handle both Docker API format and our Port interface
                                return port && (port.privatePort || port.PrivatePort || port.ContainerPort)
                              })

                              if (validPorts.length === 0) {
                                return (
                                  <Content component={ContentVariants.small}>
                                    No exposed ports
                                  </Content>
                                )
                              }

                              return (
                                <LabelGroup>
                                  {validPorts.slice(0, 3).map((port, index) => {
                                    // Handle different API response formats
                                    const privatePort = port.privatePort || port.PrivatePort || port.ContainerPort
                                    const publicPort = port.publicPort || port.PublicPort
                                    const portType = port.type || port.Type || 'tcp'
                                    
                                    const portDisplay = publicPort 
                                      ? `${publicPort}:${privatePort}/${portType}`
                                      : `${privatePort}/${portType}`
                                      
                                    return (
                                      <Label key={index} variant="outline" color="blue">
                                        {portDisplay}
                                      </Label>
                                    )
                                  })}
                                  {validPorts.length > 3 && (
                                    <Label variant="outline" color="grey">
                                      +{validPorts.length - 3} more
                                    </Label>
                                  )}
                                </LabelGroup>
                              )
                            })()
                            }
                  </Td>
                  {showActions && (
                    <Td>
                      {isManaged && renderActionButtons(container)}
                      {!isManaged && (
                        <Flex gap={{ default: 'gapSm' }}>
                          <FlexItem>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<EyeIcon />}
                              onClick={() => setSelectedContainerId(container.id)}
                            >
                              View
                            </Button>
                          </FlexItem>
                        </Flex>
                      )}
                    </Td>
                  )}
                </Tr>
              )
            } catch (error) {
              console.error('Error rendering container:', container?.id || 'unknown', error)
              return (
                <Tr key={container?.id || Math.random()}>
                  <Td colSpan={4}>Error loading container: {container?.name || 'Unknown'}</Td>
                </Tr>
              )
            }
              })}
              </Tbody>
            </Table>
          </FlexItem>
        </Flex>
      </FlexItem>
    )
  }

  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapXl' }}>
      <FlexItem>
        <Title headingLevel="h2" size="xl">
          Container Management
        </Title>
      </FlexItem>

      {/* Managed Database Containers */}
      {renderContainerTable(
        managedContainers,
        "Managed Database Containers",
        "No managed database containers found",
        true
      )}

      {/* Other Running Containers */}
      {renderContainerTable(
        otherRunningContainers,
        "Other Running Containers",
        "No other running containers found",
        false
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        variant={ModalVariant.small}
        title="Delete Database Container"
        titleIconVariant="warning"
        isOpen={!!showConfirmDelete}
        onClose={() => setShowConfirmDelete(null)}
      >
        <div style={{ padding: '24px' }}>
          <Content>
            Are you sure you want to delete this database container? 
            This action cannot be undone and all data will be lost unless you have persistent storage configured.
          </Content>
        </div>
        <div style={{ padding: '0 24px 24px 24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <Button
            variant="danger"
            onClick={() => showConfirmDelete && handleRemove(showConfirmDelete, true)}
            isDisabled={removeMutation.isPending}
            isLoading={removeMutation.isPending}
          >
            Delete Container
          </Button>
          <Button
            variant="link"
            onClick={() => setShowConfirmDelete(null)}
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </Flex>
  )
}