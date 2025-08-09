import { useState, useEffect } from 'react'
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
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
  EmptyState,
  EmptyStateBody,
  TextInput,
  InputGroup,
  InputGroupItem,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  ValidatedOptions
} from '@patternfly/react-core'
import {
  FolderIcon,
  FolderOpenIcon,
  ArrowLeftIcon,
  PlusIcon
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
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

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

  const createDirectory = async () => {
    if (!newDirName.trim()) {
      setCreateError('Directory name is required')
      return
    }

    setCreating(true)
    setCreateError(null)

    try {
      const response = await fetch('http://localhost:3001/api/filesystem/mkdir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: currentPath,
          name: newDirName.trim()
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create directory')
      }

      // Reset form and refresh directory listing
      setNewDirName('')
      setShowCreateForm(false)
      fetchDirectory(currentPath)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCreating(false)
    }
  }

  const handleCreateCancel = () => {
    setShowCreateForm(false)
    setNewDirName('')
    setCreateError(null)
  }


  return (
    <Modal
      variant={ModalVariant.medium}
      isOpen={isOpen}
      onClose={onClose}
    >
      <ModalHeader>
        <Title headingLevel="h1" size="2xl">
          Select Directory
        </Title>
        <Title headingLevel="h4" size="md" style={{ marginTop: '0.5rem', color: 'var(--pf-v5-global--Color--200)' }}>
          Current Path: {currentPath}
        </Title>
      </ModalHeader>

      <ModalBody>
        <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>

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
                    {/* Create Directory Form */}
                    {showCreateForm && (
                      <FlexItem>
                        <FormGroup
                          label="New Directory Name"
                          fieldId="newDirName"
                          isRequired
                        >
                          <InputGroup>
                            <InputGroupItem isFill>
                              <TextInput
                                id="newDirName"
                                value={newDirName}
                                onChange={(_event, value) => setNewDirName(value)}
                                placeholder="Enter directory name"
                                validated={createError ? ValidatedOptions.error : ValidatedOptions.default}
                              />
                            </InputGroupItem>
                            <InputGroupItem>
                              <Button
                                variant="primary"
                                onClick={createDirectory}
                                isDisabled={creating || !newDirName.trim()}
                                isLoading={creating}
                              >
                                Create
                              </Button>
                            </InputGroupItem>
                            <InputGroupItem>
                              <Button
                                variant="link"
                                onClick={handleCreateCancel}
                                isDisabled={creating}
                              >
                                Cancel
                              </Button>
                            </InputGroupItem>
                          </InputGroup>
                          {createError && (
                            <FormHelperText>
                              <HelperText>
                                <HelperTextItem variant="error">
                                  {createError}
                                </HelperTextItem>
                              </HelperText>
                            </FormHelperText>
                          )}
                        </FormGroup>
                      </FlexItem>
                    )}

                    {/* Create Directory Button */}
                    {!showCreateForm && (
                      <FlexItem>
                        <Button
                          variant="secondary"
                          icon={<PlusIcon />}
                          onClick={() => setShowCreateForm(true)}
                          style={{ width: '100%' }}
                        >
                          Create New Directory
                        </Button>
                      </FlexItem>
                    )}

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
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant="primary" onClick={handleSelect}>
          Select Current Directory
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}