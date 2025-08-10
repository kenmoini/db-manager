import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DatabaseSelector from '../DatabaseSelector'
import { databaseTemplates } from '../../utils/databaseTemplates'

describe('DatabaseSelector', () => {
  const mockOnSelect = vi.fn()

  beforeEach(() => {
    mockOnSelect.mockClear()
  })

  it('renders the component with title and description', () => {
    render(<DatabaseSelector onSelect={mockOnSelect} />)
    
    expect(screen.getByText('Choose Database Type')).toBeInTheDocument()
    expect(screen.getByText('Select the type of database you want to deploy')).toBeInTheDocument()
  })

  it('displays all available database templates', () => {
    render(<DatabaseSelector onSelect={mockOnSelect} />)
    
    databaseTemplates.forEach((template) => {
      expect(screen.getByText(template.name)).toBeInTheDocument()
      expect(screen.getByText(template.description)).toBeInTheDocument()
      expect(screen.getByText(`Port: ${template.defaultPort}`)).toBeInTheDocument()
    })
    
    expect(screen.getAllByText('Latest: latest')).toHaveLength(2)
  })

  it('allows selecting a database template', () => {
    render(<DatabaseSelector onSelect={mockOnSelect} />)
    
    const mariadbCard = screen.getByLabelText('Select MariaDB database')
    fireEvent.click(mariadbCard)
    
    expect(screen.getByText('Selected')).toBeInTheDocument()
    expect(screen.getByText('Selected: MariaDB')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue Setup' })).toBeInTheDocument()
  })

  it('shows selected template details when a template is selected', () => {
    render(<DatabaseSelector onSelect={mockOnSelect} />)
    
    const postgresCard = screen.getByLabelText('Select PostgreSQL database')
    fireEvent.click(postgresCard)
    
    expect(screen.getByText('Selected: PostgreSQL')).toBeInTheDocument()
    expect(screen.getAllByText('Advanced open-source relational database')).toHaveLength(2)
    
    const availableVersionsText = screen.getByText(/Available versions:/)
    expect(availableVersionsText).toBeInTheDocument()
    
    const continueButton = screen.getByRole('button', { name: 'Continue Setup' })
    expect(continueButton).toBeInTheDocument()
  })

  it('calls onSelect when continue button is clicked', () => {
    render(<DatabaseSelector onSelect={mockOnSelect} />)
    
    const mariadbCard = screen.getByLabelText('Select MariaDB database')
    fireEvent.click(mariadbCard)
    
    const continueButton = screen.getByRole('button', { name: 'Continue Setup' })
    fireEvent.click(continueButton)
    
    expect(mockOnSelect).toHaveBeenCalledWith(databaseTemplates[0])
  })

  it('does not show continue button when no template is selected', () => {
    render(<DatabaseSelector onSelect={mockOnSelect} />)
    
    expect(screen.queryByRole('button', { name: 'Continue Setup' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument()
  })

  it('can change selection between templates', () => {
    render(<DatabaseSelector onSelect={mockOnSelect} />)
    
    const mariadbCard = screen.getByLabelText('Select MariaDB database')
    fireEvent.click(mariadbCard)
    expect(screen.getByText('Selected: MariaDB')).toBeInTheDocument()
    
    const postgresCard = screen.getByLabelText('Select PostgreSQL database')
    fireEvent.click(postgresCard)
    expect(screen.getByText('Selected: PostgreSQL')).toBeInTheDocument()
    expect(screen.queryByText('Selected: MariaDB')).not.toBeInTheDocument()
  })

  it('maintains selection state correctly', () => {
    render(<DatabaseSelector onSelect={mockOnSelect} />)
    
    const mariadbCard = screen.getByLabelText('Select MariaDB database')
    const postgresCard = screen.getByLabelText('Select PostgreSQL database')
    
    fireEvent.click(mariadbCard)
    expect(mariadbCard).toHaveStyle('border: 2px solid rgb(0, 102, 204)')
    
    fireEvent.click(postgresCard)
    expect(postgresCard).toHaveStyle('border: 2px solid rgb(0, 102, 204)')
    expect(mariadbCard).toHaveStyle('border: 1px solid rgb(210, 210, 210)')
  })
})