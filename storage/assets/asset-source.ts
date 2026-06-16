import type { AssetKind } from '../../core/assets/pack-manifest'
import type { AssetReference } from '../../core'
import type { FurnitureFootprint } from '../../core'

/**
 * A single item surfaced by a library source: everything the browser panel
 * needs to display a card and hand off a reference for placement.
 */
export interface LibraryItem {
  reference: AssetReference
  name: string
  kind: AssetKind
  categories: string[]
  eras: string[]
  footprint: FurnitureFootprint
  thumbnail?: AssetReference
}

/**
 * A read seam over one place assets live (a pack, the user library, the project
 * folder, the content cache). Beyond identity and byte-reading, a source may
 * optionally list its library items and serve thumbnail bytes, supporting the
 * library browser and custom-import slices.
 */
export interface AssetSource {
  readonly id: string
  read(contentHash: string): Promise<Uint8Array | undefined>
  list?(): Promise<LibraryItem[]>
  readThumbnail?(contentHash: string): Promise<Uint8Array | undefined>
}

/** Re-exported for callers that build a source keyed off a reference's hash. */
export type { AssetReference }
