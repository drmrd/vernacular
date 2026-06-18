import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SectionLabel } from './index'

afterEach(cleanup)

describe('SectionLabel', () => {
  it('renders its children', () => {
    render(<SectionLabel>Materials</SectionLabel>)
    expect(screen.getByText('Materials')).toBeInTheDocument()
  })

  it('carries the ds-section-label class', () => {
    render(<SectionLabel>Materials</SectionLabel>)
    expect(screen.getByText('Materials')).toHaveClass('ds-section-label')
  })
})
