// cspell:ignore patternfly
import { useState, useRef } from 'react'
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
  Form,
  FormGroup,
  InputGroup,
  InputGroupItem,
  ExpandableSection,
  TextArea,
  CodeBlock,
  CodeBlockCode,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
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
  EyeSlashIcon,
  PlusCircleIcon,
  UserIcon,
  PlayCircleIcon
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

interface UserInfo {
  username: string
  host?: string
  privileges: string
  has_password: string
  valid_until?: string
}

interface ConnectionCredentials {
  username: string
  password: string
}

export default function ManagedDatabases() {
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false)
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // Refs for input focus
  const passwordInputRef = useRef<HTMLInputElement>(null)
  
  // SQL executor state
  const [sqlCommand, setSqlCommand] = useState('')
  const [sqlOutput, setSqlOutput] = useState<string | null>(null)
  const [isExecutingSql, setIsExecutingSql] = useState(false)
  const [sqlExecutorExpanded, setSqlExecutorExpanded] = useState(false)
  
  // Add user modal state
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    host: '%' // Default to % for MySQL/MariaDB (all hosts)
  })
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [createUserError, setCreateUserError] = useState<string | null>(null)
  
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
    setUsers([])
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
    
    // Focus password input after container selection
    setTimeout(() => {
      if (passwordInputRef.current) {
        passwordInputRef.current.focus()
        passwordInputRef.current.select() // Also select the text if there's a pre-filled password
      }
    }, 100)
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
      
      // Fetch users after successful connection
      fetchUsers(selectedContainer, credentials)
    } catch (error) {
      console.error('Error connecting to database:', error)
      setConnectionError(error instanceof Error ? error.message : 'Failed to connect to database')
      setIsConnected(false)
    } finally {
      setIsLoadingDatabases(false)
    }
  }

  const fetchUsers = async (container: Container, credentials: ConnectionCredentials) => {
    setIsLoadingUsers(true)
    
    try {
      const dbType = container.labels?.['db-manager.database-type']
      const port = getContainerPort(container)
      
      if (!port) return
      
      const response = await fetch('http://localhost:3000/api/database/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: 'localhost',
          port: port,
          username: credentials.username,
          password: credentials.password,
          type: dbType
        })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setIsLoadingUsers(false)
    }
  }
  
  const handleCreateUser = async () => {
    if (!selectedContainer || !newUser.username || !newUser.password) return
    
    setIsCreatingUser(true)
    setCreateUserError(null)
    
    try {
      const dbType = selectedContainer.labels?.['db-manager.database-type']
      const port = getContainerPort(selectedContainer)
      
      if (!port) {
        throw new Error('No exposed port found for database container')
      }
      
      const response = await fetch('http://localhost:3000/api/database/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: 'localhost',
          port: port,
          username: credentials.username,
          password: credentials.password,
          type: dbType,
          newUsername: newUser.username,
          newPassword: newUser.password,
          newHost: dbType === 'postgresql' ? undefined : newUser.host // Host is only for MySQL/MariaDB
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to create user')
      }
      
      // Close modal and refresh users list
      setIsAddUserModalOpen(false)
      setNewUser({ username: '', password: '', host: '%' })
      
      // Refresh the users list
      if (selectedContainer && credentials) {
        fetchUsers(selectedContainer, credentials)
      }
    } catch (error) {
      console.error('Error creating user:', error)
      setCreateUserError(error instanceof Error ? error.message : 'Failed to create user')
    } finally {
      setIsCreatingUser(false)
    }
  }
  
  const handleSqlExecute = async () => {
    if (!selectedContainer || !sqlCommand.trim()) return
    
    setIsExecutingSql(true)
    setSqlOutput(null)
    
    try {
      const dbType = selectedContainer.labels?.['db-manager.database-type']
      const port = getContainerPort(selectedContainer)
      
      if (!port) {
        throw new Error('No exposed port found for database container')
      }
      
      const response = await fetch('http://localhost:3000/api/database/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: 'localhost',
          port: port,
          username: credentials.username,
          password: credentials.password,
          type: dbType,
          query: sqlCommand
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to execute SQL command')
      }
      
      // Format the output based on the result type
      if (data.rows && Array.isArray(data.rows)) {
        // Format as table-like output for SELECT queries
        if (data.rows.length === 0) {
          setSqlOutput('Query executed successfully. No rows returned.')
        } else {
          const headers = Object.keys(data.rows[0])
          const headerRow = headers.join(' | ')
          const separator = headers.map(h => '-'.repeat(Math.max(h.length, 10))).join('-|-')
          const dataRows = data.rows.map((row: any) => 
            headers.map(h => String(row[h] ?? 'NULL')).join(' | ')
          ).join('\n')
          setSqlOutput(`${headerRow}\n${separator}\n${dataRows}`)
        }
      } else if (data.message) {
        setSqlOutput(data.message)
      } else {
        setSqlOutput(JSON.stringify(data, null, 2))
      }
    } catch (error) {
      console.error('Error executing SQL:', error)
      setSqlOutput(`Error: ${error instanceof Error ? error.message : 'Failed to execute SQL command'}`)
    } finally {
      setIsExecutingSql(false)
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
            <Form onSubmit={(e) => {
              e.preventDefault();
              if (selectedContainer && credentials.username && !isLoadingDatabases) {
                handleConnect();
              }
            }}>
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
                            readOnly
                            onFocus={(e) => e.target.removeAttribute('readonly')}
                          />
                        </FormGroup>
                      </FlexItem>

                      <FlexItem>
                        <FormGroup label="Password">
                          <InputGroup>
                            <InputGroupItem isFill>
                              <TextInput
                                ref={passwordInputRef}
                                value={credentials.password}
                                onChange={(_event, value) => setCredentials(prev => ({ ...prev, password: value }))}
                                type={showPassword ? 'text' : 'password'}
                                aria-label="Database password"
                                style={{ width: '150px' }}
                                readOnly
                                onFocus={(e) => e.target.removeAttribute('readonly')}
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
                          type="submit"
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
            </Form>
          </CardBody>
        </Card>
      </FlexItem>

      {isConnected && databases.length > 0 && (
        <FlexItem>
          <Card>
            <CardHeader>
              <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                  <Title headingLevel="h3" size="lg">
                    Databases in {getContainerDisplayName(selectedContainer!)}
                  </Title>
                </FlexItem>
                <FlexItem>
                  <Button
                    variant="primary"
                    icon={<PlusCircleIcon />}
                    onClick={() => {
                      // TODO: Implement add database functionality
                      console.log('Add database clicked for:', selectedContainer)
                    }}
                  >
                    Add Database
                  </Button>
                </FlexItem>
              </Flex>
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

      {isConnected && users.length > 0 && (
        <FlexItem>
          <Card>
            <CardHeader>
              <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                  <Title headingLevel="h3" size="lg">
                    Users in {getContainerDisplayName(selectedContainer!)}
                  </Title>
                </FlexItem>
                <FlexItem>
                  <Button
                    variant="primary"
                    icon={<PlusCircleIcon />}
                    onClick={() => setIsAddUserModalOpen(true)}
                  >
                    Add User
                  </Button>
                </FlexItem>
              </Flex>
            </CardHeader>
            <CardBody>
              {isLoadingUsers ? (
                <Flex justifyContent={{ default: 'justifyContentCenter' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <Spinner size="lg" />
                  </FlexItem>
                  <FlexItem>
                    <Content>Loading users...</Content>
                  </FlexItem>
                </Flex>
              ) : (
                <Table aria-label="User list" variant="compact">
                  <Thead>
                    <Tr>
                      <Th width={25}>Username</Th>
                      {getDatabaseTypeLabel(selectedContainer!) === 'MariaDB' && (
                        <Th width={20}>Host</Th>
                      )}
                      <Th width={25}>Privileges</Th>
                      <Th width={15}>Has Password</Th>
                      {getDatabaseTypeLabel(selectedContainer!) === 'PostgreSQL' && (
                        <Th width={15}>Valid Until</Th>
                      )}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {users.map((user, index) => (
                      <Tr key={index}>
                        <Td>
                          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                            <FlexItem>
                              <UserIcon />
                            </FlexItem>
                            <FlexItem>
                              <strong>{user.username}</strong>
                            </FlexItem>
                          </Flex>
                        </Td>
                        {getDatabaseTypeLabel(selectedContainer!) === 'MariaDB' && (
                          <Td>
                            <Content component={ContentVariants.small}>
                              {user.host || 'N/A'}
                            </Content>
                          </Td>
                        )}
                        <Td>
                          <Label 
                            color={
                              user.privileges === 'Superuser' ? 'red' : 
                              user.privileges === 'Full Access' ? 'orange' : 
                              user.privileges === 'Can Create DB' ? 'blue' : 
                              user.privileges === 'Read Only' ? 'green' : 
                              'grey'
                            }
                            isCompact
                          >
                            {user.privileges}
                          </Label>
                        </Td>
                        <Td>
                          <Label 
                            color={user.has_password === 'Yes' ? 'green' : 'red'} 
                            isCompact
                          >
                            {user.has_password}
                          </Label>
                        </Td>
                        {getDatabaseTypeLabel(selectedContainer!) === 'PostgreSQL' && (
                          <Td>{user.valid_until || 'Never'}</Td>
                        )}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </FlexItem>
      )}

      {isConnected && (
        <FlexItem>
          <Card>
            <CardBody>
              <ExpandableSection
                toggleText="SQL Command Executor"
                onToggle={(_event, isExpanded) => setSqlExecutorExpanded(isExpanded)}
                isExpanded={sqlExecutorExpanded}
              >
                <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }} style={{ marginTop: '1rem' }}>
                  <FlexItem>
                    <FormGroup label="SQL Command" fieldId="sql-command">
                      <TextArea
                        id="sql-command"
                        value={sqlCommand}
                        onChange={(_event, value) => setSqlCommand(value)}
                        rows={5}
                        placeholder="Enter SQL command (e.g., SELECT * FROM users LIMIT 10)"
                        aria-label="SQL command input"
                        resizeOrientation="vertical"
                      />
                    </FormGroup>
                  </FlexItem>
                  
                  <FlexItem>
                    <Button
                      variant="primary"
                      icon={<PlayCircleIcon />}
                      onClick={handleSqlExecute}
                      isDisabled={!sqlCommand.trim() || isExecutingSql}
                      isLoading={isExecutingSql}
                    >
                      Execute
                    </Button>
                  </FlexItem>
                  
                  {sqlOutput && (
                    <FlexItem>
                      <FormGroup label="Output" fieldId="sql-output">
                        <CodeBlock>
                          <CodeBlockCode>
                            {sqlOutput}
                          </CodeBlockCode>
                        </CodeBlock>
                      </FormGroup>
                    </FlexItem>
                  )}
                </Flex>
              </ExpandableSection>
            </CardBody>
          </Card>
        </FlexItem>
      )}

      {/* Add User Modal */}
      <Modal
        variant={ModalVariant.small}
        isOpen={isAddUserModalOpen}
        onClose={() => {
          setIsAddUserModalOpen(false)
          setNewUser({ username: '', password: '', host: '%' })
          setCreateUserError(null)
        }}
      >
        <ModalHeader title="Create Database User" />
        <ModalBody>
          <Form>
          <FormGroup label="Username" isRequired fieldId="new-username">
            <TextInput
              id="new-username"
              value={newUser.username}
              onChange={(_event, value) => setNewUser(prev => ({ ...prev, username: value }))}
              type="text"
              aria-label="New user username"
              isRequired
            />
          </FormGroup>
          
          <FormGroup label="Password" isRequired fieldId="new-password">
            <TextInput
              id="new-password"
              value={newUser.password}
              onChange={(_event, value) => setNewUser(prev => ({ ...prev, password: value }))}
              type="password"
              aria-label="New user password"
              isRequired
            />
          </FormGroup>
          
          {selectedContainer?.labels?.['db-manager.database-type'] !== 'postgresql' && (
            <FormGroup 
              label="Host" 
              fieldId="new-host"
            >
              <TextInput
                id="new-host"
                value={newUser.host}
                onChange={(_event, value) => setNewUser(prev => ({ ...prev, host: value }))}
                type="text"
                aria-label="New user host"
                placeholder="%"
              />
              <Content component={ContentVariants.small}>
                Use '%' for all hosts, 'localhost' for local only, or specify an IP/hostname
              </Content>
            </FormGroup>
          )}
          
          {createUserError && (
            <Alert
              variant={AlertVariant.danger}
              title="Failed to create user"
              isInline
            >
              {createUserError}
            </Alert>
          )}
        </Form>
        </ModalBody>
        <ModalFooter>
          <Button
            key="create"
            variant="primary"
            onClick={handleCreateUser}
            isDisabled={!newUser.username || !newUser.password || isCreatingUser}
            isLoading={isCreatingUser}
          >
            Create User
          </Button>
          <Button
            key="cancel"
            variant="link"
            onClick={() => {
              setIsAddUserModalOpen(false)
              setNewUser({ username: '', password: '', host: '%' })
              setCreateUserError(null)
            }}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </Flex>
  )
}