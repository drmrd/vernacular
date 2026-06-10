import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EmptyState, LoadingState } from './status'

afterEach(cleanup)

describe('LoadingState', () => {
  it('announces its message through a status role', () => {
    render(<LoadingState message="Loading project..." />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading project...')
  })
})

describe('EmptyState', () => {
  it('renders its title in a labeled region', () => {
    render(<EmptyState title="No projects yet" />)
    expect(screen.getByRole('region', { name: 'No projects yet' })).toBeInTheDocument()
  })

  it('renders an optional description', () => {
    render(<EmptyState title="No projects yet" description="Create one to begin." />)
    expect(screen.getByText('Create one to begin.')).toBeInTheDocument()
  })

  it('renders an optional action slot', () => {
    render(<EmptyState title="No projects yet" action={<button>New project</button>} />)
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument()
  })
})
