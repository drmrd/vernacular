import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NotificationProvider, BannerRegion } from '../editor/design-system'
import type { DocumentHandle } from '../session'
import type { StorageCapabilities } from '../storage'
import { useDegradedStorageBanner } from './use-degraded-storage-banner'

type HandleDurability = Pick<DocumentHandle, 'durable'>

const TAB_ONLY: HandleDurability = { durable: false }
const KEPT: HandleDurability = { durable: true }

const BANNER_WITH_FOLDERS =
  'This browser is not keeping your projects. They last until this tab closes. To keep one, export it, or open a folder.'
const BANNER_WITHOUT_FOLDERS =
  'This browser is not keeping your projects. They last until this tab closes. To keep one, export it.'

function capabilitiesWith(fileSystemAccess: boolean): StorageCapabilities {
  return {
    opfs: false,
    indexedDb: false,
    fileSystemAccess,
    persisted: false,
    estimatedQuotaBytes: null,
  }
}

interface HarnessProps {
  handle: HandleDurability | null
  capabilities: StorageCapabilities | null
}

function Harness({ handle, capabilities }: HarnessProps) {
  useDegradedStorageBanner(handle, capabilities)
  return <BannerRegion />
}

function renderHarness(props: HarnessProps) {
  const inProvider = (each: HarnessProps) => (
    <NotificationProvider>
      <Harness {...each} />
    </NotificationProvider>
  )
  const { rerender, container } = render(inProvider(props))
  return { container, show: (each: HarnessProps) => rerender(inProvider(each)) }
}

describe('useDegradedStorageBanner', () => {
  it('says that projects last until the tab closes, and offers a folder, where the browser opens folders', () => {
    renderHarness({ handle: TAB_ONLY, capabilities: capabilitiesWith(true) })

    expect(within(screen.getByRole('alert')).getByText(BANNER_WITH_FOLDERS)).toBeInTheDocument()
  })

  it('says the same without the folder offer where the browser opens no folders', () => {
    renderHarness({ handle: TAB_ONLY, capabilities: capabilitiesWith(false) })

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText(BANNER_WITHOUT_FOLDERS)).toBeInTheDocument()
    expect(alert).not.toHaveTextContent(/open a folder/i)
  })

  it('raises nothing for a project that the store keeps', () => {
    const { container } = renderHarness({ handle: KEPT, capabilities: capabilitiesWith(true) })

    expect(container).toBeEmptyDOMElement()
  })

  it('raises nothing while no project is open', () => {
    const { container } = renderHarness({ handle: null, capabilities: capabilitiesWith(true) })

    expect(container).toBeEmptyDOMElement()
  })

  it('raises nothing while the capabilities are still resolving', () => {
    const { container } = renderHarness({ handle: TAB_ONLY, capabilities: null })

    expect(container).toBeEmptyDOMElement()
  })

  it('raises the banner once the capabilities are known', () => {
    const { show } = renderHarness({ handle: TAB_ONLY, capabilities: null })

    show({ handle: TAB_ONLY, capabilities: capabilitiesWith(true) })

    expect(within(screen.getByRole('alert')).getByText(BANNER_WITH_FOLDERS)).toBeInTheDocument()
  })

  it('can be dismissed', () => {
    renderHarness({ handle: TAB_ONLY, capabilities: capabilitiesWith(true) })

    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument()
  })

  it('stays away after a dismissal when a later project is also not kept', async () => {
    const capabilities = capabilitiesWith(true)
    const { show } = renderHarness({ handle: TAB_ONLY, capabilities })
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))

    show({ handle: null, capabilities })
    show({ handle: { durable: false }, capabilities })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stays in place when a project that the store keeps opens after it', () => {
    const capabilities = capabilitiesWith(true)
    const { show } = renderHarness({ handle: TAB_ONLY, capabilities })

    show({ handle: KEPT, capabilities })

    expect(within(screen.getByRole('alert')).getByText(BANNER_WITH_FOLDERS)).toBeInTheDocument()
  })
})
