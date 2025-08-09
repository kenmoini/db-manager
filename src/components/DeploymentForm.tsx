import { useState, useEffect } from 'react'
import {
  Title,
  Form,
  FormGroup,
  FormSection,
  TextInput,
  FormSelect,
  FormSelectOption,
  NumberInput,
  Button,
  ActionGroup,
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  Alert,
  AlertVariant,
  Checkbox,
  InputGroup,
  InputGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  ValidatedOptions,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Content,
  ContentVariants
} from '@patternfly/react-core'
import {
  ArrowLeftIcon,
  EyeIcon,
  EyeSlashIcon,
  FolderIcon,
  SyncAltIcon,
  SaveIcon
} from '@patternfly/react-icons'
import { useDeployDatabase } from '../hooks/usePodman'
import { databaseTemplates, generateRandomPassword, validateDatabaseName, validatePort } from '../utils/databaseTemplates'
import { DatabaseConfig, DatabaseTemplate } from '../types'

interface DeploymentFormProps {
  template?: DatabaseTemplate
  onCancel: () => void
  onSuccess?: (containerId: string) => void
}

export default function DeploymentForm({ template, onCancel, onSuccess }: DeploymentFormProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<DatabaseTemplate>(
    template || databaseTemplates[0]
  )
  const [config, setConfig] = useState<DatabaseConfig>({
    type: selectedTemplate.type,
    name: '',
    version: selectedTemplate.defaultVersion,
    rootPassword: '',
    port: selectedTemplate.defaultPort,
    persistentStorage: true,
    storagePath: '',
    environment: {},
  })
  
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const deployMutation = useDeployDatabase()

  useEffect(() => {
    if (template && template !== selectedTemplate) {
      setSelectedTemplate(template)
      setConfig(prev => ({
        ...prev,
        type: template.type,
        version: template.defaultVersion,
        port: template.defaultPort,
      }))
    }
  }, [template, selectedTemplate])

  const handleInputChange = (field: string, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }))
    
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleEnvironmentChange = (key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      environment: {
        ...prev.environment,
        [key]: value,
      },
    }))
  }

  const generatePassword = (field: string) => {
    const password = generateRandomPassword()
    if (field === 'rootPassword') {
      handleInputChange('rootPassword', password)
    } else {
      handleEnvironmentChange(field, password)
    }
  }

  const togglePasswordVisibility = (field: string) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    const nameError = validateDatabaseName(config.name)
    if (nameError) newErrors.name = nameError

    const portError = validatePort(config.port)
    if (portError) newErrors.port = portError

    if (!config.rootPassword) {
      newErrors.rootPassword = 'Root password is required'
    }

    selectedTemplate.environmentVariables.forEach(envVar => {
      if (envVar.required && !config.environment?.[envVar.key] && envVar.key !== 'MYSQL_ROOT_PASSWORD' && envVar.key !== 'POSTGRES_PASSWORD') {
        newErrors[envVar.key] = `${envVar.label} is required`
      }
    })

    if (config.persistentStorage && !config.storagePath) {
      newErrors.storagePath = 'Storage path is required when persistent storage is enabled'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setIsSubmitting(true)
    
    try {
      const finalConfig: DatabaseConfig = {
        ...config,
        environment: {
          ...config.environment,
          ...(config.type === 'mariadb' ? {
            MYSQL_ROOT_PASSWORD: config.rootPassword,
            ...(config.database ? { MYSQL_DATABASE: config.database } : {}),
            ...(config.username ? { MYSQL_USER: config.username } : {}),
            ...(config.password ? { MYSQL_PASSWORD: config.password } : {}),
          } : {
            POSTGRES_PASSWORD: config.rootPassword,
            ...(config.database ? { POSTGRES_DB: config.database } : {}),
            ...(config.username ? { POSTGRES_USER: config.username } : {}),
          }),
        },
      }

      const result = await deployMutation.mutateAsync(finalConfig)
      onSuccess?.(result.containerId)
    } catch (error) {
      console.error('Deployment failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getValidationState = (field: string): ValidatedOptions => {
    return errors[field] ? ValidatedOptions.error : ValidatedOptions.default
  }

  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapLg' }}>
      <FlexItem>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <Button
                variant="link"
                onClick={onCancel}
                icon={<ArrowLeftIcon />}
                iconPosition="start"
              >
                Back
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Flex direction={{ default: 'column' }}>
                <FlexItem>
                  <Title headingLevel="h2" size="xl">
                    Deploy {selectedTemplate.name}
                  </Title>
                </FlexItem>
                <FlexItem>
                  <Content component={ContentVariants.p}>
                    Configure your database deployment
                  </Content>
                </FlexItem>
              </Flex>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
      </FlexItem>

      <FlexItem>
        <Form onSubmit={handleSubmit}>
          <Grid hasGutter>
            <GridItem xl={8} lg={10} md={12}>
              <Flex direction={{ default: 'column' }} gap={{ default: 'gapLg' }}>
                
                {/* Basic Configuration */}
                <FlexItem>
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <Title headingLevel="h3" size="lg">
                          Basic Configuration
                        </Title>
                      </CardTitle>
                    </CardHeader>
                    <CardBody>
                      <FormSection>
                        <Grid hasGutter>
                          <GridItem span={12}>
                            <FormGroup
                              label="Database Name"
                              isRequired
                              fieldId="name"
                            >
                              <TextInput
                                id="name"
                                value={config.name}
                                onChange={(_event, value) => handleInputChange('name', value)}
                                placeholder="my-database"
                                validated={getValidationState('name')}
                              />
                              {errors.name && (
                                <FormHelperText>
                                  <HelperText>
                                    <HelperTextItem variant="error">
                                      {errors.name}
                                    </HelperTextItem>
                                  </HelperText>
                                </FormHelperText>
                              )}
                            </FormGroup>
                          </GridItem>
                          
                          <GridItem md={6} span={12}>
                            <FormGroup
                              label="Version"
                              fieldId="version"
                            >
                              <FormSelect
                                id="version"
                                value={config.version}
                                onChange={(_event, value) => handleInputChange('version', value)}
                              >
                                {selectedTemplate.availableVersions.map(version => (
                                  <FormSelectOption key={version} value={version} label={version} />
                                ))}
                              </FormSelect>
                            </FormGroup>
                          </GridItem>
                          
                          <GridItem md={6} span={12}>
                            <FormGroup
                              label="Port"
                              isRequired
                              fieldId="port"
                            >
                              <NumberInput
                                id="port"
                                value={config.port}
                                onMinus={() => handleInputChange('port', Math.max(1024, config.port - 1))}
                                onPlus={() => handleInputChange('port', Math.min(65535, config.port + 1))}
                                onChange={(event) => {
                                  const value = parseInt((event.target as HTMLInputElement).value) || 0
                                  handleInputChange('port', value)
                                }}
                                min={1024}
                                max={65535}
                                validated={getValidationState('port')}
                              />
                              {errors.port && (
                                <FormHelperText>
                                  <HelperText>
                                    <HelperTextItem variant="error">
                                      {errors.port}
                                    </HelperTextItem>
                                  </HelperText>
                                </FormHelperText>
                              )}
                            </FormGroup>
                          </GridItem>
                        </Grid>
                      </FormSection>
                    </CardBody>
                  </Card>
                </FlexItem>

                {/* Authentication */}
                <FlexItem>
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <Title headingLevel="h3" size="lg">
                          Authentication
                        </Title>
                      </CardTitle>
                    </CardHeader>
                    <CardBody>
                      <FormSection>
                        <Grid hasGutter>
                          <GridItem span={12}>
                            <FormGroup
                              label="Root Password"
                              isRequired
                              fieldId="rootPassword"
                            >
                              <InputGroup>
                                <InputGroupItem isFill>
                                  <TextInput
                                    id="rootPassword"
                                    type={showPasswords.rootPassword ? 'text' : 'password'}
                                    value={config.rootPassword}
                                    onChange={(_event, value) => handleInputChange('rootPassword', value)}
                                    placeholder="Enter secure password"
                                    validated={getValidationState('rootPassword')}
                                  />
                                </InputGroupItem>
                                <InputGroupItem>
                                  <Button
                                    variant="control"
                                    onClick={() => togglePasswordVisibility('rootPassword')}
                                    icon={showPasswords.rootPassword ? <EyeSlashIcon /> : <EyeIcon />}
                                  />
                                </InputGroupItem>
                                <InputGroupItem>
                                  <Button
                                    variant="control"
                                    onClick={() => generatePassword('rootPassword')}
                                    icon={<SyncAltIcon />}
                                  />
                                </InputGroupItem>
                              </InputGroup>
                              {errors.rootPassword && (
                                <FormHelperText>
                                  <HelperText>
                                    <HelperTextItem variant="error">
                                      {errors.rootPassword}
                                    </HelperTextItem>
                                  </HelperText>
                                </FormHelperText>
                              )}
                            </FormGroup>
                          </GridItem>

                          {selectedTemplate.environmentVariables
                            .filter(envVar => envVar.key !== 'MYSQL_ROOT_PASSWORD' && envVar.key !== 'POSTGRES_PASSWORD')
                            .map(envVar => (
                              <GridItem key={envVar.key} md={6} span={12}>
                                <FormGroup
                                  label={envVar.label}
                                  isRequired={envVar.required}
                                  fieldId={envVar.key}
                                >
                                  {envVar.type === 'password' ? (
                                    <InputGroup>
                                      <InputGroupItem isFill>
                                        <TextInput
                                          id={envVar.key}
                                          type={showPasswords[envVar.key] ? 'text' : 'password'}
                                          value={config.environment?.[envVar.key] || envVar.defaultValue || ''}
                                          onChange={(_event, value) => handleEnvironmentChange(envVar.key, value)}
                                          placeholder={envVar.description}
                                          validated={getValidationState(envVar.key)}
                                        />
                                      </InputGroupItem>
                                      <InputGroupItem>
                                        <Button
                                          variant="control"
                                          onClick={() => togglePasswordVisibility(envVar.key)}
                                          icon={showPasswords[envVar.key] ? <EyeSlashIcon /> : <EyeIcon />}
                                        />
                                      </InputGroupItem>
                                      <InputGroupItem>
                                        <Button
                                          variant="control"
                                          onClick={() => generatePassword(envVar.key)}
                                          icon={<SyncAltIcon />}
                                        />
                                      </InputGroupItem>
                                    </InputGroup>
                                  ) : (
                                    <TextInput
                                      id={envVar.key}
                                      value={config.environment?.[envVar.key] || envVar.defaultValue || ''}
                                      onChange={(_event, value) => handleEnvironmentChange(envVar.key, value)}
                                      placeholder={envVar.description}
                                      validated={getValidationState(envVar.key)}
                                    />
                                  )}
                                  <FormHelperText>
                                    <HelperText>
                                      <HelperTextItem>
                                        {envVar.description}
                                      </HelperTextItem>
                                    </HelperText>
                                  </FormHelperText>
                                  {errors[envVar.key] && (
                                    <FormHelperText>
                                      <HelperText>
                                        <HelperTextItem variant="error">
                                          {errors[envVar.key]}
                                        </HelperTextItem>
                                      </HelperText>
                                    </FormHelperText>
                                  )}
                                </FormGroup>
                              </GridItem>
                            ))}
                        </Grid>
                      </FormSection>
                    </CardBody>
                  </Card>
                </FlexItem>

                {/* Storage */}
                <FlexItem>
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <Title headingLevel="h3" size="lg">
                          Storage
                        </Title>
                      </CardTitle>
                    </CardHeader>
                    <CardBody>
                      <FormSection>
                        <Grid hasGutter>
                          <GridItem span={12}>
                            <FormGroup fieldId="persistentStorage">
                              <Checkbox
                                id="persistentStorage"
                                label="Enable persistent storage"
                                description="Data will be persisted across container restarts"
                                isChecked={config.persistentStorage}
                                onChange={(_event, checked) => handleInputChange('persistentStorage', checked)}
                              />
                            </FormGroup>
                          </GridItem>
                          
                          {config.persistentStorage && (
                            <GridItem span={12}>
                              <FormGroup
                                label="Storage Path"
                                isRequired
                                fieldId="storagePath"
                              >
                                <InputGroup>
                                  <InputGroupItem isFill>
                                    <TextInput
                                      id="storagePath"
                                      value={config.storagePath}
                                      onChange={(_event, value) => handleInputChange('storagePath', value)}
                                      placeholder="/path/to/database/data"
                                      validated={getValidationState('storagePath')}
                                    />
                                  </InputGroupItem>
                                  <InputGroupItem>
                                    <Button
                                      variant="control"
                                      icon={<FolderIcon />}
                                    />
                                  </InputGroupItem>
                                </InputGroup>
                                {errors.storagePath && (
                                  <FormHelperText>
                                    <HelperText>
                                      <HelperTextItem variant="error">
                                        {errors.storagePath}
                                      </HelperTextItem>
                                    </HelperText>
                                  </FormHelperText>
                                )}
                              </FormGroup>
                            </GridItem>
                          )}
                        </Grid>
                      </FormSection>
                    </CardBody>
                  </Card>
                </FlexItem>

                {/* Form Actions */}
                <FlexItem>
                  <ActionGroup>
                    <Button 
                      type="submit"
                      variant="primary"
                      isDisabled={isSubmitting || deployMutation.isPending}
                      isLoading={isSubmitting || deployMutation.isPending}
                      spinnerAriaValueText={isSubmitting ? "Deploying..." : undefined}
                      icon={!isSubmitting && !deployMutation.isPending ? <SaveIcon /> : undefined}
                    >
                      {isSubmitting || deployMutation.isPending ? 'Deploying...' : 'Deploy Database'}
                    </Button>
                    <Button variant="link" onClick={onCancel}>
                      Cancel
                    </Button>
                  </ActionGroup>
                </FlexItem>

                {/* Error Alert */}
                {deployMutation.error && (
                  <FlexItem>
                    <Alert
                      variant={AlertVariant.danger}
                      title="Deployment failed"
                      isInline
                    >
                      {deployMutation.error.message}
                    </Alert>
                  </FlexItem>
                )}
              </Flex>
            </GridItem>
          </Grid>
        </Form>
      </FlexItem>
    </Flex>
  )
}