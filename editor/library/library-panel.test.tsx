import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AssetRegistry, type AssetSource, type LibraryItem } from '../../storage'
import { AssetRegistryProvider } from '../../bridge/react/asset-registry-context'
import type { AssetKind } from '../../core'
import { LibraryPanel } from './library-panel'

const PACK_SCOPE = 'pack:vernacular-starter@1.0.0'
const PACK_ITEM_NAME = 'Mid-century chair'
const USER_ITEM_NAME = 'Inherited armchair'
const EMPTY_STATE = 'No furniture to show yet. Import a model to add your own.'

const FOOTPRINT_WIDTH_MM = 600
const FOOTPRINT_DEPTH_MM = 600

function libraryItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    reference: { scope: PACK_SCOPE, contentHash: 'h1' },
    name: PACK_ITEM_NAME,
    kind: 'furniture' as AssetKind,
    categories: ['seating'],
    eras: ['mid-century'],
    footprint: { width: FOOTPRINT_WIDTH_MM, depth: FOOTPRINT_DEPTH_MM },
    ...overrides,
  }
}

function listingSource(id: string, items: LibraryItem[]): AssetSource {
  return { id, read: async () => undefined, list: async () => items }
}

function registryOf(packItems: LibraryItem[], userItems: LibraryItem[]): AssetRegistry {
  return new AssetRegistry([
    { kind: 'pack', source: listingSource(PACK_SCOPE, packItems) },
    { kind: 'user', source: listingSource('user', userItems) },
  ])
}

function renderPanel(
  registry: AssetRegistry,
  onPick: (item: LibraryItem) => void = vi.fn(),
  onImport: () => void = vi.fn(),
): void {
  render(
    <AssetRegistryProvider registry={registry}>
      <LibraryPanel onPick={onPick} onImport={onImport} />
    </AssetRegistryProvider>,
  )
}

afterEach(cleanup)

describe('LibraryPanel', () => {
  it('lists items from both the pack and user sources', async () => {
    const packItem = libraryItem({ name: PACK_ITEM_NAME })
    const userItem = libraryItem({ name: USER_ITEM_NAME })
    renderPanel(registryOf([packItem], [userItem]))

    expect(await screen.findByRole('button', { name: PACK_ITEM_NAME })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: USER_ITEM_NAME })).toBeInTheDocument()
  })

  it('exposes a labelled furniture library region', () => {
    renderPanel(registryOf([libraryItem()], []))

    expect(screen.getByRole('region', { name: /furniture library/i })).toBeInTheDocument()
  })

  it('calls onPick with the picked item when its button is clicked', async () => {
    const user = userEvent.setup()
    const packItem = libraryItem({ name: PACK_ITEM_NAME })
    const onPick = vi.fn()
    renderPanel(registryOf([packItem], []), onPick)

    await user.click(await screen.findByRole('button', { name: PACK_ITEM_NAME }))

    expect(onPick).toHaveBeenCalledWith(packItem)
  })

  it('calls onImport once when the Import GLB action is clicked', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    renderPanel(registryOf([libraryItem()], []), vi.fn(), onImport)

    await user.click(screen.getByRole('button', { name: /import glb/i }))

    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state and no item buttons when the registry lists nothing', async () => {
    renderPanel(new AssetRegistry([]))

    expect(await screen.findByText(EMPTY_STATE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: PACK_ITEM_NAME })).toBeNull()
  })
})
