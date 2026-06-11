import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Stack } from './stack'

afterEach(cleanup)

describe('Stack', () => {
  it('renders its children', () => {
    render(
      <Stack>
        <span>a</span>
        <span>b</span>
      </Stack>,
    )
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
  })

  it('defaults to a vertical stack', () => {
    const { container } = render(
      <Stack>
        <span>a</span>
      </Stack>,
    )
    expect(container.firstChild).toHaveClass('ds-stack--vertical')
  })

  it('applies the horizontal direction', () => {
    const { container } = render(
      <Stack direction="horizontal">
        <span>a</span>
      </Stack>,
    )
    expect(container.firstChild).toHaveClass('ds-stack--horizontal')
  })

  it('sets the gap custom property from the named spacing step', () => {
    const { container } = render(
      <Stack gap="space-3">
        <span>a</span>
      </Stack>,
    )
    expect((container.firstChild as HTMLElement).style.getPropertyValue('--ds-stack-gap')).toBe(
      'var(--space-3)',
    )
  })
})
