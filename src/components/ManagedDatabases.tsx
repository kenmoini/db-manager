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
  TextInput,
  Button,
  FormGroup,
  InputGroup,
  InputGroupItem,
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
  ConnectedIcon,
  EyeIcon,
  EyeSlashIcon
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

interface ConnectionCredentials {
  username: string
  password: string
}

export default function ManagedDatabases() {
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // Connection credentials
  const [credentials, setCredentials] = useState<ConnectionCredentials>({
    username: 'root',
    password: ''
  })
  
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
    setIsConnected(false)
    
    // Set default username based on database type
    const dbType = container.labels?.['db-manager.database-type']
    if (dbType === 'postgresql') {
      setCredentials(prev => ({ ...prev, username: 'postgres' }))
    } else {
      setCredentials(prev => ({ ...prev, username: 'root' }))
    }
    
    // Try to get the root password from labels if available
    const rootPassword = container.labels?.['db-manager.root-password']
    if (rootPassword) {
      setCredentials(prev => ({ ...prev, password: rootPassword }))
    }
  }

  const handleConnect = async () => {
    if (!selectedContainer) return
    
    setIsLoadingDatabases(true)
    setConnectionError(null)
    setIsConnected(false)

    try {
      const dbType = selectedContainer.labels?.['db-manager.database-type']
      const port = getContainerPort(selectedContainer)
      
      if (!port) {
        throw new Error('No exposed port found for database container')
      }

      // Make API call to connect to database
      const response = await fetch('http://localhost:3000/api/database/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          containerId: selectedContainer.id,
          host: 'localhost', // Containers are accessible via localhost when ports are mapped
          port: port,
          username: credentials.username,
          password: credentials.password,
          database: dbType === 'postgresql' ? 'postgres' : undefined,
          type: dbType
        })
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to connect to database')
      }

      setDatabases(data.databases || [])
      setIsConnected(true)
    } catch (error) {
      console.error('Error connecting to database:', error)
      setConnectionError(error instanceof Error ? error.message : 'Failed to connect to database')
      setIsConnected(false)
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
    
    // Fallback to parsing from ports array - get the public port
    const ports = container.ports || []
    const validPorts = ports.filter(port => 
      port && port.publicPort && port.privatePort
    )
    
    if (validPorts.length > 0) {
      return validPorts[0].publicPort || null
    }
    
    return null
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
            <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>
                <Title headingLevel="h3" size="lg">
                  Database Connection
                </Title>
              </FlexItem>
              {isConnected && selectedContainer && (
                <FlexItem>
                  <Label color="green" icon={<ConnectedIcon />}>
                    Connected to {getDatabaseTypeLabel(selectedContainer)} database
                  </Label>
                </FlexItem>
              )}
            </Flex>
          </CardHeader>
          <CardBody>
            <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
              <FlexItem>
                <Flex gap={{ default: 'gapMd' }} alignItems={{ default: 'alignItemsFlexEnd' }}>
                  <FlexItem flex={{ default: 'flex_1' }}>
                    <FormGroup label="Database Container" isRequired>
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
                                  <ConnectedIcon /> Port {getContainerPort(container)}
                                </Label>
                              </FlexItem>
                            </Flex>
                          </SelectOption>
                        ))}
                      </Select>
                    </FormGroup>
                  </FlexItem>

                  {selectedContainer && (
                    <>
                      <FlexItem>
                        <FormGroup label="Username" isRequired>
                          <TextInput
                            value={credentials.username}
                            onChange={(_event, value) => setCredentials(prev => ({ ...prev, username: value }))}
                            type="text"
                            aria-label="Database username"
                            style={{ width: '150px' }}
                          />
                        </FormGroup>
                      </FlexItem>

                      <FlexItem>
                        <FormGroup label="Password">
                          <InputGroup>
                            <InputGroupItem isFill>
                              <TextInput
                                value={credentials.password}
                                onChange={(_event, value) => setCredentials(prev => ({ ...prev, password: value }))}
                                type={showPassword ? 'text' : 'password'}
                                aria-label="Database password"
                                style={{ width: '150px' }}
                              />
                            </InputGroupItem>
                            <InputGroupItem>
                              <Button
                                variant="control"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                              >
                                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                              </Button>
                            </InputGroupItem>
                          </InputGroup>
                        </FormGroup>
                      </FlexItem>

                      <FlexItem>
                        <Button
                          variant="primary"
                          onClick={handleConnect}
                          isDisabled={!credentials.username || isLoadingDatabases}
                          isLoading={isLoadingDatabases}
                        >
                          Connect
                        </Button>
                      </FlexItem>
                    </>
                  )}
                </Flex>
              </FlexItem>

              {connectionError && (
                <FlexItem>
                  <Alert 
                    variant={AlertVariant.danger} 
                    title="Connection Failed" 
                    isInline
                  >
                    {connectionError}
                  </Alert>
                </FlexItem>
              )}

            </Flex>
          </CardBody>
        </Card>
      </FlexItem>

      {isConnected && databases.length > 0 && (
        <FlexItem>
          <Card>
            <CardHeader>
              <Title headingLevel="h3" size="lg">
                Databases in {getContainerDisplayName(selectedContainer!)}
              </Title>
            </CardHeader>
            <CardBody>
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
            </CardBody>
          </Card>
        </FlexItem>
      )}
    </Flex>
  )
}