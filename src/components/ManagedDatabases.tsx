import { useState } from 'react'
import {
  Title,
  Card,
  CardBody,
  CardHeader,
  Flex,
  FlexItem,
  Select,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
  EmptyState,
  Spinner,
  Alert,
  AlertVariant,
  Content,
  ContentVariants,
  Label,
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
  DatabaseIcon,
  ExclamationTriangleIcon,
  ConnectedIcon
} from '@patternfly/react-icons'
import { useAllContainers } from '../hooks/usePodman'
import { podmanService } from '../services/podman'
import { Container } from '../types'

interface DatabaseInfo {
  name: string
  size?: string
  owner?: string
  encoding?: string
  collation?: string
}

export default function ManagedDatabases() {
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  
  const { data: containers, isLoading: isLoadingContainers, error: containersError } = useAllContainers()

  // Filter for running managed database containers
  const runningManagedDatabases = containers?.filter(container => {
    return container.state === 'running' && 
           podmanService.isManagedContainer(container) && 
           podmanService.isDatabaseContainer(container)
  }) || []

  const handleContainerSelect = (container: Container) => {
    setSelectedContainer(container)
    setIsSelectOpen(false)
    setDatabases([])
    setConnectionError(null)
    
    // Auto-load databases when container is selected
    loadDatabases(container)
  }

  const loadDatabases = async (container: Container) => {
    setIsLoadingDatabases(true)
    setConnectionError(null)

    try {
      const dbType = container.labels?.['db-manager.database-type']
      const port = getContainerPort(container)
      
      if (!port) {
        throw new Error('No exposed port found for database container')
      }

      // For now, we'll simulate the database connection
      // In a real implementation, this would make an API call to a backend service
      // that connects to the database and lists the databases
      const mockDatabases = await simulateDatabaseConnection(dbType)
      setDatabases(mockDatabases)
    } catch (error) {
      console.error('Error loading databases:', error)
      setConnectionError(error instanceof Error ? error.message : 'Failed to connect to database')
    } finally {
      setIsLoadingDatabases(false)
    }
  }

  const getContainerPort = (container: Container): number | null => {
    // First try to get the port from the container label (most reliable)
    const labelPort = container.labels?.['db-manager.database-port']
    if (labelPort) {
      const parsedPort = parseInt(labelPort)
      if (!isNaN(parsedPort)) {
        return parsedPort
      }
    }
    
    // Fallback to parsing from ports array
    const ports = container.ports || []
    const validPorts = ports.filter(port => 
      port && port.privatePort
    )
    
    if (validPorts.length > 0) {
      const port = validPorts[0]
      return port.publicPort || port.privatePort || null
    }
    
    return null
  }

  // Simulate database connection - in a real app this would be a backend API call
  const simulateDatabaseConnection = async (dbType: string): Promise<DatabaseInfo[]> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // Mock different database types
    if (dbType === 'mariadb' || dbType === 'mysql') {
      return [
        { name: 'information_schema', size: '2.1 MB', owner: 'root', encoding: 'utf8', collation: 'utf8_general_ci' },
        { name: 'performance_schema', size: '0 bytes', owner: 'root', encoding: 'utf8', collation: 'utf8_general_ci' },
        { name: 'mysql', size: '2.8 MB', owner: 'root', encoding: 'utf8', collation: 'utf8_general_ci' },
        { name: 'test_db', size: '156 KB', owner: 'root', encoding: 'utf8', collation: 'utf8_general_ci' },
        { name: 'mock_app_database', size: '45.2 MB', owner: 'mock_app_user', encoding: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
      ]
    } else if (dbType === 'postgresql') {
      return [
        { name: 'postgres', size: '8.4 MB', owner: 'postgres', encoding: 'UTF8', collation: 'en_US.utf8' },
        { name: 'template0', size: '8.2 MB', owner: 'postgres', encoding: 'UTF8', collation: 'en_US.utf8' },
        { name: 'template1', size: '8.2 MB', owner: 'postgres', encoding: 'UTF8', collation: 'en_US.utf8' },
        { name: 'mock_app_database', size: '23.7 MB', owner: 'mock_app_user', encoding: 'UTF8', collation: 'en_US.utf8' },
        { name: 'analytics', size: '156.3 MB', owner: 'analytics_user', encoding: 'UTF8', collation: 'en_US.utf8' }
      ]
    }
    
    return []
  }

  const getDatabaseTypeLabel = (container: Container) => {
    const dbType = container.labels?.['db-manager.database-type']
    return dbType === 'mariadb' ? 'MariaDB' : dbType === 'postgresql' ? 'PostgreSQL' : 'Unknown'
  }

  const getContainerDisplayName = (container: Container) => {
    const managedName = container.labels?.['db-manager.database-name']
    if (managedName) return managedName
    
    const containerName = container.name
    return containerName?.replace(/^\//, '') || 'Unnamed'
  }

  if (isLoadingContainers) {
    return (
      <EmptyState>
        <Spinner />
        <Title headingLevel="h2" size="lg">
          Loading database containers...
        </Title>
      </EmptyState>
    )
  }

  if (containersError) {
    return (
      <EmptyState>
        <ExclamationTriangleIcon />
        <Title headingLevel="h2" size="lg">
          Unable to load containers
        </Title>
        <Alert variant={AlertVariant.danger} title="Connection Error" isInline>
          {containersError.message}
        </Alert>
      </EmptyState>
    )
  }

  if (runningManagedDatabases.length === 0) {
    return (
      <EmptyState>
        <DatabaseIcon />
        <Title headingLevel="h2" size="lg">
          No running managed databases
        </Title>
        <Content>
          Start a managed database container to connect and explore its databases.
        </Content>
      </EmptyState>
    )
  }

  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapLg' }}>
      <FlexItem>
        <Title headingLevel="h2" size="xl">
          Managed Databases
        </Title>
        <Content component={ContentVariants.p}>
          Connect to running database containers and explore their databases
        </Content>
      </FlexItem>

      <FlexItem>
        <Card>
          <CardHeader>
            <Title headingLevel="h3" size="lg">
              Database Connection
            </Title>
          </CardHeader>
          <CardBody>
            <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
              <FlexItem>
                <Content component={ContentVariants.small}>Select a database container:</Content>
                <Select
                  isOpen={isSelectOpen}
                  selected={selectedContainer?.id}
                  onSelect={(_event, selection) => {
                    const container = runningManagedDatabases.find(c => c.id === selection)
                    if (container) handleContainerSelect(container)
                  }}
                  onOpenChange={(isOpen) => setIsSelectOpen(isOpen)}
                  toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                    <MenuToggle ref={toggleRef} onClick={() => setIsSelectOpen(!isSelectOpen)} isExpanded={isSelectOpen}>
                      {selectedContainer 
                        ? `${getContainerDisplayName(selectedContainer)} (${getDatabaseTypeLabel(selectedContainer)})`
                        : 'Select database container...'
                      }
                    </MenuToggle>
                  )}
                >
                  {runningManagedDatabases.map((container) => (
                    <SelectOption key={container.id} value={container.id}>
                      <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                        <FlexItem>
                          {getDatabaseTypeLabel(container) === 'MariaDB' ? '🗄️' : '🐘'}
                        </FlexItem>
                        <FlexItem>
                          {getContainerDisplayName(container)}
                        </FlexItem>
                        <FlexItem>
                          <Label color="blue" isCompact>
                            {getDatabaseTypeLabel(container)}
                          </Label>
                        </FlexItem>
                        <FlexItem>
                          <Label color="green" isCompact>
                            <ConnectedIcon /> Running
                          </Label>
                        </FlexItem>
                      </Flex>
                    </SelectOption>
                  ))}
                </Select>
              </FlexItem>

              {selectedContainer && (
                <FlexItem>
                  <Alert 
                    variant={connectionError ? AlertVariant.danger : AlertVariant.info} 
                    title={connectionError || `Connected to ${getDatabaseTypeLabel(selectedContainer)} container`} 
                    isInline
                  >
                    {!connectionError && (
                      <Content>
                        Container: <strong>{getContainerDisplayName(selectedContainer)}</strong> | 
                        Port: <strong>{getContainerPort(selectedContainer)}</strong> | 
                        Type: <strong>{getDatabaseTypeLabel(selectedContainer)}</strong>
                      </Content>
                    )}
                  </Alert>
                </FlexItem>
              )}
            </Flex>
          </CardBody>
        </Card>
      </FlexItem>

      {selectedContainer && !connectionError && (
        <FlexItem>
          <Card>
            <CardHeader>
              <Title headingLevel="h3" size="lg">
                Databases in {getContainerDisplayName(selectedContainer)}
              </Title>
            </CardHeader>
            <CardBody>
              {isLoadingDatabases ? (
                <Flex justifyContent={{ default: 'justifyContentCenter' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <Spinner size="lg" />
                  </FlexItem>
                  <FlexItem>
                    <Content>Connecting to database and retrieving database list...</Content>
                  </FlexItem>
                </Flex>
              ) : databases.length > 0 ? (
                <Table aria-label="Database list" variant="compact">
                  <Thead>
                    <Tr>
                      <Th width={30}>Database Name</Th>
                      <Th width={20}>Size</Th>
                      <Th width={20}>Owner</Th>
                      <Th width={15}>Encoding</Th>
                      <Th width={15}>Collation</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {databases.map((db, index) => (
                      <Tr key={index}>
                        <Td>
                          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                            <FlexItem>
                              <DatabaseIcon />
                            </FlexItem>
                            <FlexItem>
                              <strong>{db.name}</strong>
                            </FlexItem>
                          </Flex>
                        </Td>
                        <Td>{db.size || 'N/A'}</Td>
                        <Td>{db.owner || 'N/A'}</Td>
                        <Td>{db.encoding || 'N/A'}</Td>
                        <Td>{db.collation || 'N/A'}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              ) : (
                <EmptyState>
                  <DatabaseIcon />
                  <Title headingLevel="h4" size="md">
                    No databases found
                  </Title>
                  <Content>
                    This database container appears to have no databases or the connection failed.
                  </Content>
                </EmptyState>
              )}
            </CardBody>
          </Card>
        </FlexItem>
      )}
    </Flex>
  )
}