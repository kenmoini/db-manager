import { useState, useEffect } from 'react'
import {
  Modal,
  ModalVariant,
  Button,
  Title,
  Card,
  CardBody,
  List,
  ListItem,
  Flex,
  FlexItem,
  Icon,
  Spinner,
  Alert,
  AlertVariant,
  Breadcrumb,
  BreadcrumbItem,
  EmptyState,
  EmptyStateBody
} from '@patternfly/react-core'
import {
  FolderIcon,
  FolderOpenIcon,
  HomeIcon,
  ArrowLeftIcon
} from '@patternfly/react-icons'

interface DirectoryItem {
  name: string
  isDirectory: boolean
  path: string
}

interface DirectoryData {
  currentPath: string
  parentPath: string | null
  directories: DirectoryItem[]
}

interface DirectoryBrowserProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (path: string) => void
  initialPath?: string
}

export default function DirectoryBrowser({
  isOpen,
  onClose,
  onSelect,
  initialPath = '/'
}: DirectoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [directoryData, setDirectoryData] = useState<DirectoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDirectory = async (path: string) => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`http://localhost:3001/api/filesystem?path=${encodeURIComponent(path)}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch directory')
      }
      
      const data: DirectoryData = await response.json()
      setDirectoryData(data)
      setCurrentPath(data.currentPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchDirectory(currentPath)
    }
  }, [isOpen, currentPath])

  const handleDirectoryClick = (path: string) => {
    setCurrentPath(path)
  }

  const handleParentClick = () => {
    if (directoryData?.parentPath) {
      setCurrentPath(directoryData.parentPath)
    }
  }

  const handleSelect = () => {
    onSelect(currentPath)
    onClose()
  }

  const getBreadcrumbItems = () => {
    const parts = currentPath.split('/').filter(Boolean)
    const items = [{ name: 'Root', path: '/' }]
    
    let buildPath = ''
    parts.forEach(part => {
      buildPath += '/' + part
      items.push({ name: part, path: buildPath })
    })
    
    return items
  }

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Select Directory"
      isOpen={isOpen}
      onClose={onClose}
    >
      <div style={{ padding: '2rem' }}>
        <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
        <FlexItem>
          <Title headingLevel="h4" size="md">
            Current Path: {currentPath}
          </Title>
        </FlexItem>

        <FlexItem>
          <Breadcrumb>
            {getBreadcrumbItems().map((item, index, array) => (
              <BreadcrumbItem
                key={item.path}
                isActive={index === array.length - 1}
                onClick={() => index < array.length - 1 ? handleDirectoryClick(item.path) : undefined}
                style={{ cursor: index < array.length - 1 ? 'pointer' : 'default' }}
              >
                {index === 0 ? (
                  <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                    <Icon size="sm">
                      <HomeIcon />
                    </Icon>
                    <span>{item.name}</span>
                  </Flex>
                ) : (
                  item.name
                )}
              </BreadcrumbItem>
            ))}
          </Breadcrumb>
        </FlexItem>

        {error && (
          <FlexItem>
            <Alert variant={AlertVariant.danger} title="Error loading directory">
              {error}
            </Alert>
          </FlexItem>
        )}

        <FlexItem>
          <Card>
            <CardBody>
              {loading ? (
                <Flex justifyContent={{ default: 'justifyContentCenter' }}>
                  <Spinner size="lg" />
                </Flex>
              ) : directoryData ? (
                <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
                  {directoryData.parentPath && (
                    <FlexItem>
                      <Button
                        variant="link"
                        icon={<ArrowLeftIcon />}
                        onClick={handleParentClick}
                        style={{ padding: '8px', width: '100%', justifyContent: 'flex-start' }}
                      >
                        .. (Parent Directory)
                      </Button>
                    </FlexItem>
                  )}
                  
                  {directoryData.directories.length > 0 ? (
                    <FlexItem>
                      <List isPlain>
                        {directoryData.directories.map(dir => (
                          <ListItem key={dir.path}>
                            <Button
                              variant="link"
                              onClick={() => handleDirectoryClick(dir.path)}
                              style={{ 
                                padding: '8px',
                                width: '100%',
                                justifyContent: 'flex-start',
                                textAlign: 'left'
                              }}
                            >
                              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                                <Icon size="sm">
                                  <FolderIcon />
                                </Icon>
                                <span>{dir.name}</span>
                              </Flex>
                            </Button>
                          </ListItem>
                        ))}
                      </List>
                    </FlexItem>
                  ) : (
                    <FlexItem>
                      <EmptyState>
                        <Title headingLevel="h4" size="lg">
                          <Icon size="lg" style={{ marginRight: '8px' }}>
                            <FolderOpenIcon />
                          </Icon>
                          No subdirectories
                        </Title>
                        <EmptyStateBody>
                          This directory contains no subdirectories.
                        </EmptyStateBody>
                      </EmptyState>
                    </FlexItem>
                  )}
                </Flex>
              ) : null}
            </CardBody>
          </Card>
        </FlexItem>
        
        <FlexItem>
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
            <FlexItem>
              <Button variant="link" onClick={onClose}>
                Cancel
              </Button>
            </FlexItem>
            <FlexItem>
              <Button variant="primary" onClick={handleSelect}>
                Select Current Directory
              </Button>
            </FlexItem>
          </Flex>
        </FlexItem>
        </Flex>
      </div>
    </Modal>
  )
}