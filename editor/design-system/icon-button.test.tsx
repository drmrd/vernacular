import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IconButton } from './index'

afterEach(cleanup)

describe('IconButton', () => {
  it('renders an accessible button from its aria-label', () => {
    render(<IconButton aria-label="Zoom in" />)
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
  })

  it('defaults the type to button so it never submits a form', () => {
    render(<IconButton aria-label="Zoom in" />)
    expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveAttribute('type', 'button')
  })

  it('carries the ds-icon-button class', () => {
    render(<IconButton aria-label="Zoom in" />)
    expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveClass('ds-icon-button')
  })

  it('forwards the click handler', async () => {
    const onClick = vi.fn()
    render(<IconButton aria-label="Zoom in" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('forwards aria-pressed for toggle controls', () => {
    render(<IconButton aria-label="Toggle grid" aria-pressed />)
    expect(screen.getByRole('button', { name: 'Toggle grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('forwards the disabled state', () => {
    render(<IconButton aria-label="Zoom in" disabled />)
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
  })
})
