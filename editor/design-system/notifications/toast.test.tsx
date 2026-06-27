import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Toast } from './toast'
import type { Notification } from './notification'

function base(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'a',
    tier: 'toast',
    severity: 'info',
    message: 'Hello',
    dismissible: true,
    ...overrides,
  }
}

describe('Toast', () => {
  it('renders the message', () => {
    render(<Toast notification={base()} onDismiss={() => {}} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('uses role alert for errors and role status otherwise', () => {
    const { rerender } = render(
      <Toast notification={base({ severity: 'error' })} onDismiss={() => {}} />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<Toast notification={base({ severity: 'success' })} onDismiss={() => {}} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('calls onDismiss with the id when the dismiss button is clicked', async () => {
    const onDismiss = vi.fn()
    render(<Toast notification={base()} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledWith('a')
  })

  it('invokes an action handler', async () => {
    const onAction = vi.fn()
    render(
      <Toast
        notification={base({ actions: [{ label: 'Retry', onAction }] })}
        onDismiss={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('omits the dismiss button when not dismissible', () => {
    render(<Toast notification={base({ dismissible: false })} onDismiss={() => {}} />)
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
  })

  it('renders a determinate progress bar when a pending toast supplies a fraction', () => {
    render(<Toast notification={base({ pending: true, fraction: 0.25 })} onDismiss={() => {}} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '0.25')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '1')
  })
})
