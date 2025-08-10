import { useState } from 'react'
import {
  Title,
  Gallery,
  GalleryItem,
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Button,
  Flex,
  FlexItem,
  Label,
  Icon,
  Content,
  ContentVariants
} from '@patternfly/react-core'
import { ArrowRightIcon, InfoIcon } from '@patternfly/react-icons'
import { databaseTemplates } from '../utils/databaseTemplates'
import { DatabaseTemplate } from '../types'

interface DatabaseSelectorProps {
  onSelect: (template: DatabaseTemplate) => void
}

export default function DatabaseSelector({ onSelect }: DatabaseSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<DatabaseTemplate | null>(null)

  const handleSelect = (template: DatabaseTemplate) => {
    setSelectedTemplate(template)
  }

  const handleKeyDown = (event: React.KeyboardEvent, template: DatabaseTemplate) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelect(template)
    }
  }

  const handleContinue = () => {
    if (selectedTemplate) {
      onSelect(selectedTemplate)
    }
  }

  return (
    <>
      <Flex direction={{ default: 'column' }} gap={{ default: 'gapLg' }}>
        <FlexItem>
          <Title headingLevel="h2" size="xl">
            Choose Database Type
          </Title>
          <Content component={ContentVariants.p}>
            Select the type of database you want to deploy
          </Content>
        </FlexItem>

        <FlexItem>
          <Gallery
            hasGutter
            minWidths={{
              default: '280px',
              sm: '320px',
              md: '360px',
              lg: '400px',
            }}
            maxWidths={{
              sm: '1fr',
              md: '1fr',
              lg: '1fr',
            }}
          >
            {databaseTemplates.map((template) => (
              <GalleryItem key={template.type}>
                <Card
                  onClick={() => handleSelect(template)}
                  onKeyDown={(event) => handleKeyDown(event, template)}
                  style={{ 
                    cursor: 'pointer',
                    border: selectedTemplate?.type === template.type 
                      ? '2px solid #0066cc' 
                      : '1px solid #d2d2d2',
                    height: '100%',
                    minHeight: '280px'
                  }}
                  aria-label={`Select ${template.name} database`}
                  role="button"
                  tabIndex={0}
                >
                  <CardHeader style={{ paddingBottom: '8px' }}>
                    <CardTitle>
                      <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }} gap={{ default: 'gapSm' }} style={{ flexWrap: 'nowrap', overflow: 'hidden' }}>
                        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }} style={{ flexShrink: 1, minWidth: 0 }}>
                          <FlexItem style={{ flexShrink: 0 }}>
                            <Icon size="xl">
                              <span style={{ fontSize: '24px' }}>{template.icon}</span>
                            </Icon>
                          </FlexItem>
                          <FlexItem style={{ minWidth: 0, flex: 1 }}>
                            <Title headingLevel="h3" size="lg" style={{ 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis',
                              margin: 0
                            }}>
                              {template.name}
                            </Title>
                          </FlexItem>
                        </Flex>
                        {selectedTemplate?.type === template.type && (
                          <FlexItem style={{ flexShrink: 0 }}>
                            <Label color="blue" isCompact>Selected</Label>
                          </FlexItem>
                        )}
                      </Flex>
                    </CardTitle>
                  </CardHeader>
                  <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Content component={ContentVariants.p} style={{ 
                      lineHeight: '1.4',
                      marginBottom: '8px',
                      flex: 1
                    }}>
                      {template.description}
                    </Content>
                    <Flex direction={{ default: 'column' }} gap={{ default: 'gapXs' }} style={{ marginTop: 'auto' }}>
                      <FlexItem>
                        <Label color="blue" isCompact>
                          <InfoIcon /> Port: {template.defaultPort}
                        </Label>
                      </FlexItem>
                      <FlexItem>
                        <Label color="green" isCompact>
                          <InfoIcon /> Latest: {template.defaultVersion}
                        </Label>
                      </FlexItem>
                    </Flex>
                  </CardBody>
                </Card>
              </GalleryItem>
            ))}
          </Gallery>
        </FlexItem>

        {selectedTemplate && (
          <FlexItem>
            <Card>
              <CardBody>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
                      <FlexItem>
                        <Title headingLevel="h4" size="md">
                          Selected: {selectedTemplate.name}
                        </Title>
                      </FlexItem>
                      <FlexItem>
                        <Content component={ContentVariants.p}>
                          {selectedTemplate.description}
                        </Content>
                      </FlexItem>
                      <FlexItem>
                        <Content component={ContentVariants.small}>
                          Available versions: {selectedTemplate.availableVersions.map(v => v.displayName).join(', ')}
                        </Content>
                      </FlexItem>
                    </Flex>
                  </FlexItem>
                  <FlexItem>
                    <Button
                      variant="primary"
                      onClick={handleContinue}
                      icon={<ArrowRightIcon />}
                      iconPosition="end"
                    >
                      Continue Setup
                    </Button>
                  </FlexItem>
                </Flex>
              </CardBody>
            </Card>
          </FlexItem>
        )}
      </Flex>
    </>
  )
}