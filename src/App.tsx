import { useState } from 'react'
import {
  Page,
  PageSection,
  Title,
  Nav,
  NavList,
  NavItem,
  NavItemSeparator,
  Masthead,
  MastheadMain,
  MastheadBrand,
  MastheadContent,
  PageSidebar,
  PageSidebarBody,
  Flex,
  FlexItem,
  Label
} from '@patternfly/react-core'
import { DatabaseIcon, CubeIcon, PlayIcon, CubesIcon, PlusIcon, TableIcon  } from '@patternfly/react-icons'
import { useAllContainers } from './hooks/usePodman'
import DatabaseSelector from './components/DatabaseSelector'
import ContainerList from './components/ContainerList'
import DeploymentForm from './components/DeploymentForm'
import ManagedDatabases from './components/ManagedDatabases'
import { DatabaseTemplate } from './types'
import { podmanService } from './services/podman'

function App() {
  const [activeTab, setActiveTab] = useState<'deploy' | 'manage' | 'databases'>('manage')
  const [showDeployForm, setShowDeployForm] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<DatabaseTemplate | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  
  const { data: containers = [] } = useAllContainers()
  const totalContainers = containers.length
  const runningContainers = containers.filter(c => c.state?.toLowerCase().trim() === 'running').length
  const managedContainers = containers.filter(c => podmanService.isManagedContainer(c)).length

  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
            <FlexItem>
              <DatabaseIcon />
            </FlexItem>
            <FlexItem>
              <Title headingLevel="h1" size="lg">
                Database Manager
              </Title>
            </FlexItem>
          </Flex>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
          <FlexItem>
            <Label color="grey">
              <CubeIcon /> {totalContainers} Total
            </Label>
          </FlexItem>
          <FlexItem>
            <Label color="green">
              <PlayIcon /> {runningContainers} Running
            </Label>
          </FlexItem>
          <FlexItem>
            <Label color="blue">
              <DatabaseIcon /> {managedContainers} Managed
            </Label>
          </FlexItem>
        </Flex>
      </MastheadContent>
    </Masthead>
  )

  const navigation = (
    <Nav>
      <NavList>
        <NavItem
          style={{ backgroundColor: 'var(--pf-t--global--color--brand--default)', color: 'var(--pf-t--global--background--color--primary--default)' }}
          itemId="deploy"
          isActive={activeTab === 'deploy'}
          onClick={() => {
            setActiveTab('deploy')
            setShowDeployForm(false)
            setSelectedTemplate(null)
          }}
        >
          <PlusIcon /> Deploy Database
        </NavItem>
        <NavItem
          itemId="manage"
          isActive={activeTab === 'manage'}
          onClick={() => setActiveTab('manage')}
        >
          <CubesIcon /> Manage Containers
        </NavItem>
        <NavItem
          itemId="databases"
          isActive={activeTab === 'databases'}
          onClick={() => setActiveTab('databases')}
        >
          <TableIcon /> Managed Databases
        </NavItem>
      </NavList>
    </Nav>
  )

  const sidebar = (
    <PageSidebar isSidebarOpen={isSidebarOpen}>
      <PageSidebarBody>
        {navigation}
      </PageSidebarBody>
    </PageSidebar>
  )

  const getPageContent = () => {
    if (activeTab === 'deploy') {
      if (!showDeployForm) {
        return (
          <DatabaseSelector onSelect={(template) => {
            setSelectedTemplate(template)
            setShowDeployForm(true)
          }} />
        )
      } else {
        return (
          <DeploymentForm 
            template={selectedTemplate || undefined}
            onCancel={() => {
              setShowDeployForm(false)
              setSelectedTemplate(null)
            }} 
            onSuccess={() => {
              setShowDeployForm(false)
              setSelectedTemplate(null)
              setActiveTab('manage')
            }}
          />
        )
      }
    } else if (activeTab === 'manage') {
      return <ContainerList />
    } else if (activeTab === 'databases') {
      return <ManagedDatabases />
    }
  }

  return (
    <Page 
      masthead={masthead} 
      sidebar={sidebar}
      isManagedSidebar
      onPageResize={(_event, { mobileView }) => {
        setIsSidebarOpen(!mobileView)
      }}
    >
      <PageSection isFilled>
        {getPageContent()}
      </PageSection>
    </Page>
  )
}

export default App