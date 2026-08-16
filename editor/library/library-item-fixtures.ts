import { AssetRegistry, type AssetSource, type LibraryItem } from '../../storage'

// A shipped-pack scope, so fixture items read as pack-sourced rather than imported.
const PACK_SCOPE = 'pack:vernacular-starter@1.0.0'
const FOOTPRINT_MM = { width: 600, depth: 600 }
const HEIGHT_MM = 750

export const MID_CENTURY_CHAIR = 'Mid-century chair'
export const VICTORIAN_TABLE = 'Victorian oak table'

/** One pack-scoped furniture item, named and dated for filter exercises. */
export function packLibraryItem(name: string, contentHash: string, era: string): LibraryItem {
  return {
    reference: { scope: PACK_SCOPE, contentHash },
    name,
    kind: 'furniture',
    categories: ['seating'],
    eras: [era],
    styles: [],
    footprint: FOOTPRINT_MM,
    height: HEIGHT_MM,
  }
}

/**
 * A registry listing two pack items that no single filter keeps together: one
 * mid-century chair and one Victorian table.
 */
export function stockedRegistry(): AssetRegistry {
  const items = [
    packLibraryItem(MID_CENTURY_CHAIR, 'p1', 'mid-century'),
    packLibraryItem(VICTORIAN_TABLE, 'p2', 'victorian'),
  ]
  const source: AssetSource = {
    id: PACK_SCOPE,
    read: async () => undefined,
    list: async () => items,
  }
  return new AssetRegistry([{ kind: 'pack', source }])
}
