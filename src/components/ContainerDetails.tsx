import { useState } from 'react'
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
  Label,
  LabelGroup,
  CodeBlock,
  CodeBlockCode,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Spinner,
  EmptyState,
  Modal,
  ModalVariant,
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
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
            {container.ports && container.ports.length > 0 ? (
              <DescriptionList>
                {container.ports.map((port, index) => (
                  <DescriptionListGroup key={index}>
                    <DescriptionListTerm>Port {port.privatePort}</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Label variant="outline" color="blue">
                        {port.publicPort ? `${port.publicPort} → ${port.privatePort}` : port.privatePort}
                      </Label>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ))}
              </DescriptionList>
            ) : (
              <EmptyState>
                <InfoIcon />
                <Title headingLevel="h4" size="lg">
                  No exposed ports
                </Title>
              </EmptyState>
            )}
          </CardBody>
        </Card>
      </GridItem>

      <GridItem xl={4} lg={12} md={12}>
        <Card>
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
            {container.mounts && container.mounts.length > 0 ? (
              <DescriptionList>
                {container.mounts.slice(0, 3).map((mount, index) => (
                  <DescriptionListGroup key={index}>
                    <DescriptionListTerm>Mount {index + 1}</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Flex direction={{ default: 'column' }} gap={{ default: 'gapXs' }}>
                        <FlexItem>
                          <Content component={ContentVariants.small}>
                            <strong>Source:</strong> {mount.source}
                          </Content>
                        </FlexItem>
                        <FlexItem>
                          <Content component={ContentVariants.small}>
                            <strong>Destination:</strong> {mount.destination}
                          </Content>
                        </FlexItem>
                        <FlexItem>
                          <LabelGroup>
                            <Label variant="outline" color="grey">
                              {mount.mode}
                            </Label>
                            <Label variant="outline" color={mount.rw ? 'green' : 'orange'}>
                              {mount.rw ? 'RW' : 'RO'}
                            </Label>
                          </LabelGroup>
                        </FlexItem>
                      </Flex>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ))}
                {container.mounts.length > 3 && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Additional</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Label variant="outline" color="grey">
                        +{container.mounts.length - 3} more mounts
                      </Label>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
              </DescriptionList>
            ) : (
              <EmptyState>
                <InfoIcon />
                <Title headingLevel="h4" size="lg">
                  No mounted volumes
                </Title>
              </EmptyState>
            )}
          </CardBody>
        </Card>
      </GridItem>
    </Grid>
  )

  const renderLogsTab = () => (
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
          <CodeBlock>
            <CodeBlockCode className="db-manager-logs">
              {logs || 'No logs available'}
            </CodeBlockCode>
          </CodeBlock>
        )}
      </CardBody>
    </Card>
  )

  const renderStatsTab = () => (
    <Grid hasGutter>
      <GridItem xl={3} lg={6} md={6} sm={12}>
        <Card>
          <CardHeader>
            <CardTitle>CPU Usage</CardTitle>
          </CardHeader>
          <CardBody>
            {statsLoading ? (
              <Spinner size="lg" />
            ) : stats?.cpu_percent !== undefined ? (
              <Title headingLevel="h2" size="2xl">
                {stats.cpu_percent.toFixed(2)}%
              </Title>
            ) : (
              <Content>N/A</Content>
            )}
          </CardBody>
        </Card>
      </GridItem>
      
      <GridItem xl={3} lg={6} md={6} sm={12}>
        <Card>
          <CardHeader>
            <CardTitle>Memory Usage</CardTitle>
          </CardHeader>
          <CardBody>
            {statsLoading ? (
              <Spinner size="lg" />
            ) : stats?.memory ? (
              <Flex direction={{ default: 'column' }}>
                <FlexItem>
                  <Title headingLevel="h2" size="2xl">
                    {formatBytes(stats.memory.usage)}
                  </Title>
                </FlexItem>
                <FlexItem>
                  <Content component={ContentVariants.small}>
                    / {formatBytes(stats.memory.limit)}
                  </Content>
                </FlexItem>
              </Flex>
            ) : (
              <Content>N/A</Content>
            )}
          </CardBody>
        </Card>
      </GridItem>
      
      <GridItem xl={3} lg={6} md={6} sm={12}>
        <Card>
          <CardHeader>
            <CardTitle>Network I/O</CardTitle>
          </CardHeader>
          <CardBody>
            {statsLoading ? (
              <Spinner size="lg" />
            ) : stats?.networks ? (
              <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
                <FlexItem>
                  <Content>
                    <strong>RX:</strong> {formatBytes(stats.networks.rx_bytes || 0)}
                  </Content>
                </FlexItem>
                <FlexItem>
                  <Content>
                    <strong>TX:</strong> {formatBytes(stats.networks.tx_bytes || 0)}
                  </Content>
                </FlexItem>
              </Flex>
            ) : (
              <Content>N/A</Content>
            )}
          </CardBody>
        </Card>
      </GridItem>
      
      <GridItem xl={3} lg={6} md={6} sm={12}>
        <Card>
          <CardHeader>
            <CardTitle>Block I/O</CardTitle>
          </CardHeader>
          <CardBody>
            {statsLoading ? (
              <Spinner size="lg" />
            ) : stats?.blkio ? (
              <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
                <FlexItem>
                  <Content>
                    <strong>Read:</strong> {formatBytes(stats.blkio.read || 0)}
                  </Content>
                </FlexItem>
                <FlexItem>
                  <Content>
                    <strong>Write:</strong> {formatBytes(stats.blkio.write || 0)}
                  </Content>
                </FlexItem>
              </Flex>
            ) : (
              <Content>N/A</Content>
            )}
          </CardBody>
        </Card>
      </GridItem>
    </Grid>
  )

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
              <DescriptionList>
                {Object.entries(container.labels).map(([key, value]) => (
                  <DescriptionListGroup key={key}>
                    <DescriptionListTerm>{key}</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Content component={ContentVariants.small}>
                        {value}
                      </Content>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ))}
              </DescriptionList>
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
        <Card>
          <CardBody>
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
                    <FlexItem>
                      <Flex gap={{ default: 'gapSm' }}>
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
            eventKey="stats"
            title={
              <TabTitleText>
                <TachometerAltIcon /> Statistics
              </TabTitleText>
            }
          >
            {renderStatsTab()}
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
        title="Delete Database Container"
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
      >
        <Content>
          Are you sure you want to delete "{dbName}"? 
          This action cannot be undone and all data will be lost unless you have persistent storage configured.
        </Content>
        <br />
        <Flex gap={{ default: 'gapMd' }}>
          <Button
            variant="danger"
            onClick={handleRemove}
            isDisabled={removeMutation.isPending}
            isLoading={removeMutation.isPending}
          >
            Delete
          </Button>
          <Button
            variant="link"
            onClick={() => setShowConfirmDelete(false)}
          >
            Cancel
          </Button>
        </Flex>
      </Modal>
    </Flex>
  )
}