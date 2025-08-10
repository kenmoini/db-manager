import { useState, useEffect, useRef } from 'react'
import {
  Title,
  Button,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Tabs,
  Tab,
  TabTitleText,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  DataList,
  DataListItem,
  DataListItemRow,
  DataListItemCells,
  DataListCell,
  Label,
  LabelGroup,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Spinner,
  EmptyState,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Icon,
  Content,
  ContentVariants
} from '@patternfly/react-core'
import {
  ArrowLeftIcon,
  PlayIcon,
  StopIcon,
  RedoIcon,
  TrashIcon,
  TerminalIcon,
  TachometerAltIcon,
  CogIcon,
  InfoIcon,
  NetworkIcon,
  HddIcon,
  ClockIcon
} from '@patternfly/react-icons'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useContainerLogs, useContainerStats, useStartContainer, useStopContainer, useRestartContainer, useRemoveContainer } from '../hooks/usePodman'
import { formatContainerState, formatBytes } from '../utils/databaseTemplates'
import { Container } from '../types'

interface ContainerDetailsProps {
  container: Container
  onBack: () => void
}

export default function ContainerDetails({ container, onBack }: ContainerDetailsProps) {
  const [activeTab, setActiveTab] = useState<string | number>('overview')
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  
  const { data: logs, isLoading: logsLoading } = useContainerLogs(container.id, 100)
  const { data: stats, isLoading: statsLoading } = useContainerStats(container.id)
  
  const startMutation = useStartContainer()
  const stopMutation = useStopContainer()
  const restartMutation = useRestartContainer()
  const removeMutation = useRemoveContainer()

  const state = formatContainerState(container.state)
  const dbType = container.labels?.['db-manager.database-type'] || 'unknown'
  const dbName = container.labels?.['db-manager.database-name'] || container.name

  const handleStart = () => {
    startMutation.mutate(container.id)
  }

  const handleStop = () => {
    stopMutation.mutate(container.id)
  }

  const handleRestart = () => {
    restartMutation.mutate(container.id)
  }

  const handleRemove = () => {
    removeMutation.mutate({ id: container.id, force: true }, {
      onSuccess: () => {
        onBack()
      }
    })
  }

  const formatDate = (dateValue: string | number) => {
    // Handle Unix timestamps (seconds since epoch) and ISO date strings
    const date = typeof dateValue === 'number' 
      ? new Date(dateValue * 1000) // Convert seconds to milliseconds
      : new Date(dateValue)
    
    return date.toLocaleString()
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

  const renderOverviewTab = () => (
    <Grid hasGutter>
      <GridItem xl={4} lg={6} md={12}>
        <Card>
          <CardHeader>
            <CardTitle>
              <Title headingLevel="h3" size="lg">
                <Icon>
                  <ClockIcon />
                </Icon>{' '}
                Runtime Info
              </Title>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>Created</DescriptionListTerm>
                <DescriptionListDescription>
                  {formatDate(container.created)}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Image</DescriptionListTerm>
                <DescriptionListDescription>
                  <Content component={ContentVariants.small}>
                    {container.image}
                  </Content>
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>State</DescriptionListTerm>
                <DescriptionListDescription>
                  <Label color={getStatusColor(container.state)}>
                    {state.label}
                  </Label>
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Container ID</DescriptionListTerm>
                <DescriptionListDescription>
                  <Content component={ContentVariants.small}>
                    {container.id.substring(0, 12)}
                  </Content>
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </CardBody>
        </Card>
      </GridItem>

      <GridItem xl={4} lg={6} md={12}>
        <Card>
          <CardHeader>
            <CardTitle>
              <Title headingLevel="h3" size="lg">
                <Icon>
                  <NetworkIcon />
                </Icon>{' '}
                Network
              </Title>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {(() => {
              // Handle different port data structures from Docker/Podman APIs
              const ports = container.ports || []
              
              if (ports.length === 0) {
                return (
                  <EmptyState>
                    <InfoIcon />
                    <Title headingLevel="h4" size="lg">
                      No exposed ports
                    </Title>
                  </EmptyState>
                )
              }

              const validPorts = ports.filter(port => {
                // Handle both Docker API format and our Port interface
                const portAny = port as any
                return port && (port.privatePort || portAny.PrivatePort || portAny.ContainerPort)
              })

              if (validPorts.length === 0) {
                return (
                  <EmptyState>
                    <InfoIcon />
                    <Title headingLevel="h4" size="lg">
                      No exposed ports
                    </Title>
                  </EmptyState>
                )
              }

              return (
                <DescriptionList>
                  {validPorts.map((port, index) => {
                    // Handle different API response formats with type assertion
                    const portAny = port as any
                    const privatePort = port.privatePort || portAny.PrivatePort || portAny.ContainerPort
                    const publicPort = port.publicPort || portAny.PublicPort
                    const portType = port.type || portAny.Type || 'tcp'
                    const portIP = port.ip || portAny.IP || '0.0.0.0'
                    
                    return (
                      <DescriptionListGroup key={index}>
                        <DescriptionListTerm>
                          Port {privatePort}/{portType}
                        </DescriptionListTerm>
                        <DescriptionListDescription>
                          <Flex direction={{ default: 'column' }} gap={{ default: 'gapXs' }}>
                            <FlexItem>
                              <Label variant="outline" color="blue">
                                {publicPort 
                                  ? `${portIP}:${publicPort} → ${privatePort}/${portType}` 
                                  : `${privatePort}/${portType}`
                                }
                              </Label>
                            </FlexItem>
                            <FlexItem>
                              <Content component={ContentVariants.small}>
                                {publicPort 
                                  ? `External access via port ${publicPort}` 
                                  : 'Internal access only'
                                }
                              </Content>
                            </FlexItem>
                          </Flex>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )
                  })}
                </DescriptionList>
              )
            })()}
          </CardBody>
        </Card>
        {container.mounts && container.mounts.length > 0 && (
          <Card style={{ marginTop: '1.25rem' }}>
            <CardHeader>
              <CardTitle>
                <Title headingLevel="h3" size="lg">
                  <Icon>
                    <HddIcon />
                  </Icon>{' '}
                  Storage
                </Title>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
                {container.mounts.map((mount: any, index) => {
                  // Handle both lowercase and uppercase property names from different API versions
                  const source = mount.source || mount.Source || 'unknown'
                  const destination = mount.destination || mount.Destination || 'unknown'
                  const mode = mount.mode || mount.Mode || 'unknown'
                  const rw = mount.rw !== undefined ? mount.rw : (mount.RW !== undefined ? mount.RW : true)
                  const mountType = mount.type || mount.Type || 'bind'
                  const driver = mount.driver || mount.Driver || ''
                  const name = mount.name || mount.Name || ''
                  
                  return (
                    <FlexItem key={index}>
                      <Card isCompact>
                        <CardBody>
                          <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
                            {mountType === 'volume' && name && (
                              <FlexItem>
                                <Content>
                                  <strong>Volume Name:</strong>
                                </Content>
                                <Content component={ContentVariants.small}>
                                  {name}
                                </Content>
                              </FlexItem>
                            )}
                            <FlexItem>
                              <Content>
                                <strong>{mountType === 'volume' ? 'Volume Source' : 'Host Path'}:</strong>
                              </Content>
                              <Content component={ContentVariants.small}>
                                {source}
                              </Content>
                            </FlexItem>
                            <FlexItem>
                              <Content>
                                <strong>Container Path:</strong>
                              </Content>
                              <Content component={ContentVariants.small}>
                                {destination}
                              </Content>
                            </FlexItem>
                            <FlexItem>
                              <Content>
                                <strong>Properties:</strong>
                              </Content>
                              <LabelGroup>
                                <Label variant="outline" color="blue">
                                  {mountType}
                                </Label>
                                {mode && mode !== 'unknown' && (
                                  <Label variant="outline" color="grey">
                                    {mode}
                                  </Label>
                                )}
                                <Label variant="outline" color={rw ? 'green' : 'orange'}>
                                  {rw ? 'Read/Write' : 'Read Only'}
                                </Label>
                                {driver && (
                                  <Label variant="outline" color="grey">
                                    Driver: {driver}
                                  </Label>
                                )}
                              </LabelGroup>
                            </FlexItem>
                          </Flex>
                        </CardBody>
                      </Card>
                    </FlexItem>
                  )
                })}
              </Flex>
            </CardBody>
          </Card>
        )}
      </GridItem>

      <GridItem xl={4} lg={12} md={12}>
        {renderStatsTab()}
      </GridItem>
    </Grid>
  )

  const renderLogsTab = () => {
    const terminalRef = useRef<HTMLDivElement>(null)
    const terminal = useRef<Terminal | null>(null)
    const fitAddon = useRef<FitAddon | null>(null)

    useEffect(() => {
      if (terminalRef.current && !terminal.current) {
        // Create FitAddon
        fitAddon.current = new FitAddon()

        terminal.current = new Terminal({
          fontSize: 14,
          lineHeight: 1.2,
          disableStdin: true,
          convertEol: true,
          screenReaderMode: false,
          theme: {
            background: '#000000',
            foreground: '#ffffff',
            cursor: '#ffffff',
            cursorAccent: '#000000'
          },
          cursorBlink: false,
          cursorStyle: 'block'
        })
        
        // Load the fit addon
        terminal.current.loadAddon(fitAddon.current)
        
        // Open terminal in the container
        terminal.current.open(terminalRef.current)
        console.log('Terminal opened successfully')
        
        // Fit the terminal to the container
        setTimeout(() => {
          if (fitAddon.current) {
            fitAddon.current.fit()
            console.log('Terminal fitted to container')
          }
        }, 100)

        // Handle window resize
        const handleResize = () => {
          if (fitAddon.current) {
            fitAddon.current.fit()
          }
        }

        window.addEventListener('resize', handleResize)

        return () => {
          window.removeEventListener('resize', handleResize)
          if (terminal.current) {
            terminal.current.dispose()
            terminal.current = null
          }
          fitAddon.current = null
        }
      }
    }, [])

    useEffect(() => {
      console.log('Logs data:', { logs, hasLogs: !!logs, logType: typeof logs, logLength: logs?.length })
      
      if (terminal.current && logs) {
        console.log('Writing to terminal:', logs.substring(0, 100) + '...')
        terminal.current.clear()
        // Write logs with proper handling of newlines
        terminal.current.write(logs + '\r')
        
        // Scroll to bottom
        terminal.current.scrollToBottom()
      } else if (terminal.current && logs === '') {
        terminal.current.clear()
        terminal.current.write('No logs available')
      }
    }, [logs])

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>
                <Title headingLevel="h3" size="lg">
                  Container Logs
                </Title>
              </FlexItem>
              <FlexItem>
                <Content component={ContentVariants.small}>
                  Last 100 lines
                </Content>
              </FlexItem>
            </Flex>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {logsLoading ? (
            <EmptyState>
              <Spinner />
              <Title headingLevel="h4" size="lg">
                Loading logs...
              </Title>
            </EmptyState>
          ) : (
            <div 
              ref={terminalRef}
              style={{ 
                height: '500px',
                width: '100%',
                backgroundColor: '#000000',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
            />
          )}
        </CardBody>
      </Card>
    )
  }

  const renderStatsTab = () => {
    // Calculate CPU percentage from Docker stats
    const calculateCpuPercent = () => {
      if (!stats?.cpu_stats || !stats?.precpu_stats) return undefined
      
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
      const cpuCount = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1
      
      if (systemDelta > 0 && cpuDelta > 0) {
        return (cpuDelta / systemDelta) * cpuCount * 100
      }
      return 0
    }

    // Extract memory stats
    const memoryUsage = stats?.memory_stats?.usage || 0
    const memoryLimit = stats?.memory_stats?.limit || 0
    const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0

    // Extract network stats - sum all interfaces
    const calculateNetworkStats = () => {
      let rx = 0
      let tx = 0
      
      if (stats?.networks) {
        Object.values(stats.networks).forEach((net: any) => {
          rx += net.rx_bytes || 0
          tx += net.tx_bytes || 0
        })
      }
      
      return { rx, tx }
    }
    
    const networkStats = calculateNetworkStats()

    // Extract block I/O stats
    const calculateBlockIoStats = () => {
      let read = 0
      let write = 0
      
      if (stats?.blkio_stats?.io_service_bytes_recursive) {
        stats.blkio_stats.io_service_bytes_recursive.forEach((stat: any) => {
          if (stat.op === 'read' || stat.op === 'Read') {
            read += stat.value || 0
          } else if (stat.op === 'write' || stat.op === 'Write') {
            write += stat.value || 0
          }
        })
      }
      
      return { read, write }
    }
    
    const blockIoStats = calculateBlockIoStats()
    const cpuPercent = calculateCpuPercent()

    return (
      <div>
          <Card isFullHeight={true}>
            <CardHeader>
              <CardTitle>CPU Usage</CardTitle>
            </CardHeader>
            <CardBody isFilled={true}>
              {statsLoading ? (
                <Spinner size="lg" />
              ) : cpuPercent !== undefined ? (
                <Title headingLevel="h2" size="2xl">
                  {cpuPercent.toFixed(2)}%
                </Title>
              ) : (
                <Content>N/A</Content>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Memory Usage</CardTitle>
            </CardHeader>
            <CardBody isFilled={true}>
              {statsLoading ? (
                <Spinner size="lg" />
              ) : memoryUsage > 0 ? (
                <Flex direction={{ default: 'column' }}>
                  <FlexItem>
                    <Title headingLevel="h2" size="2xl">
                      {formatBytes(memoryUsage)}
                    </Title>
                  </FlexItem>
                  <FlexItem>
                    <Content component={ContentVariants.small}>
                      / {formatBytes(memoryLimit)} ({memoryPercent.toFixed(1)}%)
                    </Content>
                  </FlexItem>
                </Flex>
              ) : (
                <Content>N/A</Content>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Network I/O</CardTitle>
            </CardHeader>
            <CardBody isFilled={true}>
              {statsLoading ? (
                <Spinner size="lg" />
              ) : networkStats.rx > 0 || networkStats.tx > 0 ? (
                <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
                  <FlexItem>
                    <Content>
                      <strong>RX:</strong> {formatBytes(networkStats.rx)}
                    </Content>
                  </FlexItem>
                  <FlexItem>
                    <Content>
                      <strong>TX:</strong> {formatBytes(networkStats.tx)}
                    </Content>
                  </FlexItem>
                </Flex>
              ) : (
                <Content>N/A</Content>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Block I/O</CardTitle>
            </CardHeader>
            <CardBody isFilled={true}>
              {statsLoading ? (
                <Spinner size="lg" />
              ) : blockIoStats.read > 0 || blockIoStats.write > 0 ? (
                <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
                  <FlexItem>
                    <Content>
                      <strong>Read:</strong> {formatBytes(blockIoStats.read)}
                    </Content>
                  </FlexItem>
                  <FlexItem>
                    <Content>
                      <strong>Write:</strong> {formatBytes(blockIoStats.write)}
                    </Content>
                  </FlexItem>
                </Flex>
              ) : (
                <Content>N/A</Content>
              )}
            </CardBody>
          </Card></div>
    )
  }

  const renderConfigTab = () => (
    <Card>
      <CardHeader>
        <CardTitle>
          <Title headingLevel="h3" size="lg">
            Container Configuration
          </Title>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <Grid hasGutter>
          <GridItem span={12}>
            <Title headingLevel="h4" size="md">
              Labels
            </Title>
            {container.labels && Object.keys(container.labels).length > 0 ? (
              <DataList aria-label="Container labels">
                {Object.entries(container.labels).map(([key, value]) => (
                  <DataListItem key={key}>
                    <DataListItemRow>
                      <DataListItemCells
                        dataListCells={[
                          <DataListCell key="label-key" width={2}>
                            <strong>{key}</strong>
                          </DataListCell>,
                          <DataListCell key="label-value" width={5}>
                            <Content component={ContentVariants.small}>
                              {value}
                            </Content>
                          </DataListCell>
                        ]}
                      />
                    </DataListItemRow>
                  </DataListItem>
                ))}
              </DataList>
            ) : (
              <EmptyState>
                <InfoIcon />
                <Title headingLevel="h4" size="lg">
                  No labels configured
                </Title>
              </EmptyState>
            )}
          </GridItem>
        </Grid>
      </CardBody>
    </Card>
  )

  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapLg' }}>
      {/* Header */}
      <FlexItem>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <Button
                variant="link"
                onClick={onBack}
                icon={<ArrowLeftIcon />}
                iconPosition="start"
              >
                Back to List
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Flex gap={{ default: 'gapSm' }} style={{ marginLeft: 'auto' }}>
                {container.state === 'running' ? (
                  <Button
                    variant="secondary"
                    onClick={handleStop}
                    isDisabled={stopMutation.isPending}
                    icon={<StopIcon />}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={handleStart}
                    isDisabled={startMutation.isPending}
                    icon={<PlayIcon />}
                  >
                    Start
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={handleRestart}
                  isDisabled={restartMutation.isPending}
                  icon={<RedoIcon />}
                >
                  Restart
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setShowConfirmDelete(true)}
                  icon={<TrashIcon />}
                >
                  Delete
                </Button>
              </Flex>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
        <Card>
          <CardBody>
            <Toolbar>
              <ToolbarContent>
                <ToolbarItem>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
                    <FlexItem>
                      <Icon size="xl">
                        <span style={{ fontSize: '32px' }}>
                          {dbType === 'mariadb' ? '🗄️' : dbType === 'postgresql' ? '🐘' : '💾'}
                        </span>
                      </Icon>
                    </FlexItem>
                    <FlexItem>
                      <Flex direction={{ default: 'column' }}>
                        <FlexItem>
                          <Title headingLevel="h2" size="xl">
                            {dbName}
                          </Title>
                        </FlexItem>
                        <FlexItem>
                          <Content component={ContentVariants.small}>
                            ID: {container.id.substring(0, 12)}
                          </Content>
                        </FlexItem>
                      </Flex>
                    </FlexItem>
                  </Flex>
                </ToolbarItem>
                <ToolbarItem>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
                    <FlexItem>
                      <Label color={getStatusColor(container.state)}>
                        {state.label}
                      </Label>
                    </FlexItem>
                  </Flex>
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
          </CardBody>
        </Card>
      </FlexItem>

      {/* Tabs Content */}
      <FlexItem>
        <Tabs
          activeKey={activeTab}
          onSelect={(_event, tabIndex) => setActiveTab(tabIndex)}
        >
          <Tab
            eventKey="overview"
            title={
              <TabTitleText>
                <TachometerAltIcon /> Overview
              </TabTitleText>
            }
          >
            {renderOverviewTab()}
          </Tab>
          <Tab
            eventKey="logs"
            title={
              <TabTitleText>
                <TerminalIcon /> Logs
              </TabTitleText>
            }
          >
            {renderLogsTab()}
          </Tab>
          <Tab
            eventKey="config"
            title={
              <TabTitleText>
                <CogIcon /> Configuration
              </TabTitleText>
            }
          >
            {renderConfigTab()}
          </Tab>
        </Tabs>
      </FlexItem>

      {/* Delete Confirmation Modal */}
      <Modal
        variant={ModalVariant.small}
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
      >
        <ModalHeader
          title="Delete Database Container"
          titleIconVariant="warning"
        />
        <ModalBody>
          <Content>
            Are you sure you want to delete "{dbName}"? 
            This action cannot be undone and all data will be lost unless you have persistent storage configured.
          </Content>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="danger"
            onClick={handleRemove}
            isDisabled={removeMutation.isPending}
            isLoading={removeMutation.isPending}
          >
            Delete Container
          </Button>
          <Button
            variant="link"
            onClick={() => setShowConfirmDelete(false)}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </Flex>
  )
}