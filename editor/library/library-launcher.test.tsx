import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AssetRegistry } from '../../storage'
import { AssetRegistryProvider } from '../../bridge/react/asset-registry-context'
import { LibraryLauncher } from './library-launcher'

function renderLauncher(): void {
  render(
    <AssetRegistryProvider registry={new AssetRegistry([])}>
      <LibraryLauncher onPick={vi.fn()} onImport={vi.fn()} />
    </AssetRegistryProvider>,
  )
}

function furnitureTrigger(): HTMLElement {
  return screen.getByRole('button', { name: /furniture/i })
}

afterEach(cleanup)

describe('LibraryLauncher', () => {
  it('is closed by default with the panel hidden', () => {
    renderLauncher()

    expect(furnitureTrigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: /furniture library/i })).toBeNull()
  })

  it('opens the panel when the trigger is clicked', async () => {
    const user = userEvent.setup()
    renderLauncher()

    await user.click(furnitureTrigger())

    expect(furnitureTrigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: /furniture library/i })).toBeInTheDocument()
  })

  it('closes the panel again when the trigger is clicked a second time', async () => {
    const user = userEvent.setup()
    renderLauncher()

    await user.click(furnitureTrigger())
    await user.click(furnitureTrigger())

    expect(furnitureTrigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: /furniture library/i })).toBeNull()
  })
})
