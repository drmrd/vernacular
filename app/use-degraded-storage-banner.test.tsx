import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotificationProvider, BannerRegion } from '../editor/design-system'
import { useDegradedStorageBanner } from './use-degraded-storage-banner'
import type { StorageCapabilities } from '../storage'

const degraded: StorageCapabilities = {
  opfs: false,
  indexedDb: false,
  fileSystemAccess: false,
  persisted: false,
  estimatedQuotaBytes: null,
}

function Harness({ capabilities }: { capabilities: StorageCapabilities | null }) {
  useDegradedStorageBanner(capabilities)
  return <BannerRegion />
}

describe('useDegradedStorageBanner', () => {
  it('raises a dismissible storage-degraded banner when degraded', () => {
    render(
      <NotificationProvider>
        <Harness capabilities={degraded} />
      </NotificationProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/storage/i)
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('raises nothing while capabilities are still resolving', () => {
    const { container } = render(
      <NotificationProvider>
        <Harness capabilities={null} />
      </NotificationProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
