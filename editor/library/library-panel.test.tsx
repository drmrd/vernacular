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
    height: 750,
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
): HTMLElement {
  const { container } = render(
    <AssetRegistryProvider registry={registry}>
      <LibraryPanel onPick={onPick} onImport={onImport} />
    </AssetRegistryProvider>,
  )
  return container
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

const EAMES_NAME = 'Eames chair'
const OAK_NAME = 'Oak table'

function packAndUserRegistry(): AssetRegistry {
  const packItem = libraryItem({
    name: EAMES_NAME,
    eras: ['mid-century'],
    reference: { scope: PACK_SCOPE, contentHash: 'p1' },
  })
  const userItem = libraryItem({
    name: OAK_NAME,
    eras: ['victorian'],
    reference: { scope: 'user', contentHash: 'u1' },
  })
  return registryOf([packItem], [userItem])
}

async function renderBothLoaded(): Promise<void> {
  renderPanel(packAndUserRegistry())
  await screen.findByRole('button', { name: EAMES_NAME })
  await screen.findByRole('button', { name: OAK_NAME })
}

describe('LibraryPanel filtering', () => {
  it('filters items by a case-insensitive name search', async () => {
    const user = userEvent.setup()
    await renderBothLoaded()

    await user.type(screen.getByRole('searchbox', { name: /search furniture/i }), 'chair')

    expect(screen.getByRole('button', { name: EAMES_NAME })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: OAK_NAME })).toBeNull()
  })

  it('shows only user-scoped items when the source toggle is set to Yours', async () => {
    const user = userEvent.setup()
    await renderBothLoaded()

    await user.click(screen.getByRole('button', { name: 'Yours' }))

    expect(screen.queryByRole('button', { name: EAMES_NAME })).toBeNull()
    expect(screen.getByRole('button', { name: OAK_NAME })).toBeInTheDocument()
  })

  it('shows only pack-scoped items when the source toggle is set to Sample', async () => {
    const user = userEvent.setup()
    await renderBothLoaded()

    await user.click(screen.getByRole('button', { name: 'Sample' }))

    expect(screen.getByRole('button', { name: EAMES_NAME })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: OAK_NAME })).toBeNull()
  })

  it('narrows the grid to items in the chosen era when an era chip is activated', async () => {
    const user = userEvent.setup()
    await renderBothLoaded()

    await user.click(screen.getByRole('button', { name: 'mid-century' }))

    expect(screen.getByRole('button', { name: EAMES_NAME })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: OAK_NAME })).toBeNull()
  })
})

const EXPECTED_SEGMENTED_GROUPS = 2
const SINGLE_ACTIVE_OPTION = 1

function segmentedGroups(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.ds-segmented')]
}

function activeOptionsIn(group: HTMLElement): HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>('.is-active')]
}

describe('LibraryPanel design-system primitives', () => {
  it('renders the source-filter and era-filter groups as Segmented controls', async () => {
    const container = renderPanel(packAndUserRegistry())
    await screen.findByRole('button', { name: EAMES_NAME })
    await screen.findByRole('button', { name: OAK_NAME })

    expect(segmentedGroups(container)).toHaveLength(EXPECTED_SEGMENTED_GROUPS)
  })

  it('marks exactly one option active in each segmented filter group', async () => {
    const container = renderPanel(packAndUserRegistry())
    await screen.findByRole('button', { name: EAMES_NAME })
    await screen.findByRole('button', { name: OAK_NAME })

    const groups = segmentedGroups(container)
    expect(groups).toHaveLength(EXPECTED_SEGMENTED_GROUPS)
    for (const group of groups) {
      expect(activeOptionsIn(group)).toHaveLength(SINGLE_ACTIVE_OPTION)
    }
  })

  it('exposes the active segmented option through aria-pressed', async () => {
    const container = renderPanel(packAndUserRegistry())
    await screen.findByRole('button', { name: EAMES_NAME })
    await screen.findByRole('button', { name: OAK_NAME })

    const groups = segmentedGroups(container)
    expect(groups).toHaveLength(EXPECTED_SEGMENTED_GROUPS)
    for (const group of groups) {
      const [active] = activeOptionsIn(group)
      expect(active).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('routes the Import GLB button through the Button primitive', async () => {
    renderPanel(registryOf([libraryItem()], []))

    expect(screen.getByRole('button', { name: /import glb/i })).toHaveClass('ds-button')
  })

  it('still updates the visible items when a source segmented option is selected', async () => {
    const user = userEvent.setup()
    await renderBothLoaded()

    await user.click(screen.getByRole('button', { name: 'Yours' }))

    expect(screen.queryByRole('button', { name: EAMES_NAME })).toBeNull()
    expect(screen.getByRole('button', { name: OAK_NAME })).toBeInTheDocument()
  })

  it('still fires onImport when the Import GLB button is clicked', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    renderPanel(registryOf([libraryItem()], []), vi.fn(), onImport)

    await user.click(screen.getByRole('button', { name: /import glb/i }))

    expect(onImport).toHaveBeenCalledTimes(1)
  })
})
