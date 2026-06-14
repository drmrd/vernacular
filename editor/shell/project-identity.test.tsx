import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ProjectIdentity } from './project-identity'

afterEach(cleanup)

describe('ProjectIdentity', () => {
  it('shows the project name in the heading font', () => {
    render(<ProjectIdentity name="Eastmore Farmstead" periodLabel="Victorian, c. 1837-1901" />)
    expect(screen.getByText('Eastmore Farmstead')).toHaveClass('project-identity__name')
  })

  it('shows the period subtitle when provided', () => {
    render(<ProjectIdentity name="Eastmore Farmstead" periodLabel="Victorian, c. 1837-1901" />)
    expect(screen.getByText(/victorian/i)).toBeInTheDocument()
  })

  it('omits the subtitle when no period label is given', () => {
    render(<ProjectIdentity name="Untitled" periodLabel={undefined} />)
    expect(screen.queryByText(/c\./i)).toBeNull()
  })
})
