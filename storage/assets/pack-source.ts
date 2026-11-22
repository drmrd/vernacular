import { isModelAsset, validatePackManifest } from '../../core'
import type { AssetKind, AssetReference } from '../../core'
import type { AssetSource, LibraryItem } from './asset-source'

export interface PackReader {
  manifest(): Promise<unknown>
  readAsset(contentHash: string): Promise<Uint8Array | undefined>
  readThumbnail(contentHash: string): Promise<Uint8Array | undefined>
}

const UNKNOWN_PACK_SCOPE = 'pack:unknown@0.0.0'

interface PackAssetShape {
  mediaType?: string
  contentHash: string
  name: string
  kind: AssetKind
  categories: string[]
  eras: string[]
  styles?: string[]
  dimensions?: { width: number; depth: number; height: number }
}

type PackModelShape = PackAssetShape & { dimensions: NonNullable<PackAssetShape['dimensions']> }

interface TypedManifest {
  packId: string
  version: string
  formatVersion?: number
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
    // Narrowing holds because only manifests that passed validatePackManifest
    // reach this point, and it requires dimensions on every model asset.
    return typed.assets
      .filter((asset): asset is PackModelShape => isModelAsset(asset, typed.formatVersion))
      .map((asset) => this.toLibraryItem(asset))
  }

  private toLibraryItem(asset: PackModelShape): LibraryItem {
    return {
      reference: { scope: this.scope, contentHash: asset.contentHash },
      name: asset.name,
      kind: asset.kind,
      categories: asset.categories,
      eras: asset.eras,
      styles: asset.styles ?? [],
      footprint: { width: asset.dimensions.width, depth: asset.dimensions.depth },
      height: asset.dimensions.height,
      thumbnail: { scope: this.scope, contentHash: asset.contentHash },
    }
  }
}
