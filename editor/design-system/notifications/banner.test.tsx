import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Banner, BannerRegion } from './banner'
import { NotificationProvider, useNotifications } from './use-notifications'
import type { Notification } from './notification'
import { useEffect } from 'react'

function base(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'storage-degraded',
    tier: 'banner',
    severity: 'warning',
    message: 'Storage is degraded',
    dismissible: true,
    ...overrides,
  }
}

describe('Banner', () => {
  it('uses role alert for warning and error', () => {
    render(<Banner notification={base({ severity: 'warning' })} onDismiss={() => {}} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('calls onDismiss with the id', async () => {
    const onDismiss = vi.fn()
    render(<Banner notification={base()} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledWith('storage-degraded')
  })
})

describe('BannerRegion', () => {
  it('renders nothing when there are no banners', () => {
    const { container } = render(
      <NotificationProvider>
        <BannerRegion />
      </NotificationProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an emitted banner', () => {
    function Emit() {
      const { banner } = useNotifications()
      useEffect(() => {
        banner({ id: 'storage-degraded', severity: 'warning', message: 'Storage is degraded' })
      }, [banner])
      return <BannerRegion />
    }
    render(
      <NotificationProvider>
        <Emit />
      </NotificationProvider>,
    )
    expect(screen.getByText('Storage is degraded')).toBeInTheDocument()
  })
})
