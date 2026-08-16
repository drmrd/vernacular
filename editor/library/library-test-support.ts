import { screen } from '@testing-library/react'

import { AssetRegistry, type AssetSource, type LibraryItem } from '../../storage'

/** A shipped-pack scope, so fixture items read as pack-sourced rather than imported. */
export const PACK_SCOPE = 'pack:vernacular-starter@1.0.0'
export const MID_CENTURY_CHAIR_NAME = 'Mid-century chair'
export const VICTORIAN_TABLE_NAME = 'Victorian oak table'

const FOOTPRINT_MM = { width: 600, depth: 600 }
const HEIGHT_MM = 750

/** One pack-scoped furniture item, with any field a test cares about overridden. */
export function libraryItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    reference: { scope: PACK_SCOPE, contentHash: 'h1' },
    name: MID_CENTURY_CHAIR_NAME,
    kind: 'furniture',
    categories: ['seating'],
    eras: ['mid-century'],
    footprint: FOOTPRINT_MM,
    height: HEIGHT_MM,
    ...overrides,
  }
}

/** A source that lists the given items and holds no bytes to read. */
export function listingSource(id: string, items: LibraryItem[]): AssetSource {
  return { id, read: async () => undefined, list: async () => items }
}

/**
 * A registry listing two pack items that no single filter keeps together: one
 * mid-century chair and one Victorian table.
 */
export function stockedRegistry(): AssetRegistry {
  const items = [
    libraryItem({
      name: MID_CENTURY_CHAIR_NAME,
      reference: { scope: PACK_SCOPE, contentHash: 'p1' },
      eras: ['mid-century'],
    }),
    libraryItem({
      name: VICTORIAN_TABLE_NAME,
      reference: { scope: PACK_SCOPE, contentHash: 'p2' },
      eras: ['victorian'],
    }),
  ]
  return new AssetRegistry([{ kind: 'pack', source: listingSource(PACK_SCOPE, items) }])
}

/** The panel's furniture search control. */
export function searchBox(): HTMLElement {
  return screen.getByRole('searchbox', { name: /search furniture/i })
}
