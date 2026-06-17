import { validatePackManifest } from '../../core'
import type { AssetKind, AssetReference } from '../../core'
import type { AssetSource, LibraryItem } from './asset-source'

export interface PackReader {
  manifest(): Promise<unknown>
  readAsset(contentHash: string): Promise<Uint8Array | undefined>
  readThumbnail(contentHash: string): Promise<Uint8Array | undefined>
}

const UNKNOWN_PACK_SCOPE = 'pack:unknown@0.0.0'

interface PackAssetShape {
  contentHash: string
  name: string
  kind: AssetKind
  categories: string[]
  eras: string[]
  dimensions: { width: number; depth: number; height: number }
}

interface TypedManifest {
  packId: string
  version: string
  assets: PackAssetShape[]
}

export class PackSource implements AssetSource {
  private scope: AssetReference['scope'] = UNKNOWN_PACK_SCOPE

  constructor(private readonly reader: PackReader) {}

  get id(): string {
    return this.scope
  }

  async read(contentHash: string): Promise<Uint8Array | undefined> {
    return this.reader.readAsset(contentHash)
  }

  async readThumbnail(contentHash: string): Promise<Uint8Array | undefined> {
    return this.reader.readThumbnail(contentHash)
  }

  async list(): Promise<LibraryItem[]> {
    const manifest = await this.reader.manifest()
    if (!validatePackManifest(manifest).valid) {
      return []
    }
    const typed = manifest as TypedManifest
    this.scope = `pack:${typed.packId}@${typed.version}`
    return typed.assets.map((asset) => this.toLibraryItem(asset))
  }

  private toLibraryItem(asset: PackAssetShape): LibraryItem {
    return {
      reference: { scope: this.scope, contentHash: asset.contentHash },
      name: asset.name,
      kind: asset.kind,
      categories: asset.categories,
      eras: asset.eras,
      footprint: { width: asset.dimensions.width, depth: asset.dimensions.depth },
      thumbnail: { scope: this.scope, contentHash: asset.contentHash },
    }
  }
}
