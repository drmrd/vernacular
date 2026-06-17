import { DEFAULT_FURNITURE_HEIGHT_MM } from '../../core'
import type { AssetKind } from '../../core/assets/pack-manifest'
import type { AssetCache } from '../asset-cache'
import type { AssetSource, LibraryItem } from './asset-source'

export interface UserLibraryIndex {
  list(): Promise<LibraryItem[]>
  add(item: LibraryItem): Promise<void>
}

export interface UserAssetMeta {
  name: string
  footprint: { width: number; depth: number }
  /** Declared height in millimeters; defaults to DEFAULT_FURNITURE_HEIGHT_MM when an import has no parsed geometry. */
  height?: number
  kind: AssetKind
  eras: string[]
  categories: string[]
}

const HEX_RADIX = 16
const HEX_BYTE_WIDTH = 2

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, '0'))
    .join('')
}

export class UserSource implements AssetSource {
  readonly id = 'user'

  constructor(
    private readonly cache: AssetCache,
    private readonly index: UserLibraryIndex,
  ) {}

  async read(contentHash: string): Promise<Uint8Array | undefined> {
    return this.cache.get(contentHash)
  }

  async list(): Promise<LibraryItem[]> {
    const items = await this.index.list()
    return items.map((item) => ({ ...item, height: item.height ?? DEFAULT_FURNITURE_HEIGHT_MM }))
  }

  async put(bytes: Uint8Array, meta: UserAssetMeta): Promise<LibraryItem> {
    const contentHash = await sha256Hex(bytes)
    await this.cache.put(contentHash, bytes)
    const item: LibraryItem = {
      reference: { scope: 'user', contentHash },
      name: meta.name,
      kind: meta.kind,
      categories: meta.categories,
      eras: meta.eras,
      footprint: meta.footprint,
      height: meta.height ?? DEFAULT_FURNITURE_HEIGHT_MM,
    }
    await this.index.add(item)
    return item
  }
}
