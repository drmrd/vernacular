import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AssetRegistry } from '../../storage'
import { AssetRegistryProvider } from '../../bridge/react/asset-registry-context'
import { MID_CENTURY_CHAIR, VICTORIAN_TABLE, stockedRegistry } from './library-item-fixtures'
import { LibraryLauncher } from './library-launcher'

const SEARCH_TERM = 'chair'

function renderLauncher(registry: AssetRegistry = new AssetRegistry([])): void {
  render(
    <AssetRegistryProvider registry={registry}>
      <LibraryLauncher onPick={vi.fn()} onImport={vi.fn()} />
    </AssetRegistryProvider>,
  )
}

function searchBox(): HTMLElement {
  return screen.getByRole('searchbox', { name: /search furniture/i })
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

  it('routes the furniture trigger through the Button primitive', () => {
    renderLauncher()

    expect(furnitureTrigger()).toHaveClass('ds-button')
  })
})

describe('LibraryLauncher browsing state', () => {
  it('keeps the typed search term when the panel is closed and reopened', async () => {
    const user = userEvent.setup()
    renderLauncher(stockedRegistry())
    await user.click(furnitureTrigger())
    await screen.findByRole('button', { name: MID_CENTURY_CHAIR })
    await user.type(searchBox(), SEARCH_TERM)

    await user.click(furnitureTrigger())
    await user.click(furnitureTrigger())

    expect(await screen.findByRole('searchbox', { name: /search furniture/i })).toHaveValue(
      SEARCH_TERM,
    )
  })

  it('keeps a chosen era narrowing the grid when the panel is closed and reopened', async () => {
    const user = userEvent.setup()
    renderLauncher(stockedRegistry())
    await user.click(furnitureTrigger())
    await screen.findByRole('button', { name: MID_CENTURY_CHAIR })
    await user.click(screen.getByRole('button', { name: 'victorian' }))

    await user.click(furnitureTrigger())
    await user.click(furnitureTrigger())

    expect(await screen.findByRole('button', { name: VICTORIAN_TABLE })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: MID_CENTURY_CHAIR })).toBeNull()
  })
})
