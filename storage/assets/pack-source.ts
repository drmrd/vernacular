import { isModelAsset, isTextureAsset, packAssetMediaType, validatePackManifest } from '../../core'
import type {
  AssetDescription,
  AssetKind,
  AssetReference,
  ColorSpaceName,
  MediaType,
  TextureMediaType,
} from '../../core'
import type { AssetSource, LibraryItem } from './asset-source'

export interface PackReader {
  manifest(): Promise<unknown>
  readAsset(contentHash: string, mediaType: MediaType): Promise<Uint8Array | undefined>
  readThumbnail(contentHash: string): Promise<Uint8Array | undefined>
}

const UNKNOWN_PACK_SCOPE = 'pack:unknown@0.0.0'

interface PackAssetShape {
  mediaType?: MediaType
  contentHash: string
  name: string
  kind: AssetKind
  categories: string[]
  eras: string[]
  styles?: string[]
  dimensions?: { width: number; depth: number; height: number }
  image?: { width: number; height: number }
  tileSize?: { width: number; height: number }
  colorSpace?: ColorSpaceName
}

type PackModelShape = PackAssetShape & { dimensions: NonNullable<PackAssetShape['dimensions']> }

type PackTextureShape = PackAssetShape & {
  mediaType: TextureMediaType
  image: NonNullable<PackAssetShape['image']>
  tileSize: NonNullable<PackAssetShape['tileSize']>
  colorSpace: ColorSpaceName
}

interface TypedManifest {
  packId: string
  version: string
  formatVersion?: number
  assets: PackAssetShape[]
}

function packScopeOf(manifest: TypedManifest): AssetReference['scope'] {
  return `pack:${manifest.packId}@${manifest.version}`
}

function isPackTexture(
  asset: PackAssetShape,
  formatVersion: number | undefined,
): asset is PackTextureShape {
  return isTextureAsset(asset, formatVersion)
}

export class PackSource implements AssetSource {
  private scope: AssetReference['scope'] = UNKNOWN_PACK_SCOPE

  private loadedManifest: Promise<TypedManifest | undefined> | undefined

  constructor(private readonly reader: PackReader) {}

  get id(): string {
    return this.scope
  }

  async read(contentHash: string): Promise<Uint8Array | undefined> {
    const found = await this.findAsset(contentHash)
    if (found === undefined) {
      return undefined
    }
    return this.reader.readAsset(contentHash, packAssetMediaType(found.shape))
  }

  async readThumbnail(contentHash: string): Promise<Uint8Array | undefined> {
    return this.reader.readThumbnail(contentHash)
  }

  async describe(contentHash: string): Promise<AssetDescription | undefined> {
    const found = await this.findAsset(contentHash)
    if (found === undefined) {
      return undefined
    }
    const { shape, formatVersion } = found
    // Format 2 validation requires these fields on every texture asset.
    if (isPackTexture(shape, formatVersion)) {
      return {
        kind: 'texture',
        mediaType: shape.mediaType,
        image: shape.image,
        tileSize: shape.tileSize,
        colorSpace: shape.colorSpace,
      }
    }
    return {
      kind: 'model',
      mediaType: 'model/gltf-binary',
      dimensions: shape.dimensions as NonNullable<PackAssetShape['dimensions']>,
    }
  }

  async list(): Promise<LibraryItem[]> {
    const typed = await this.loadManifest()
    if (typed === undefined) {
      return []
    }
    // Narrowing holds because only manifests that passed validatePackManifest
    // reach this point, and it requires dimensions on every model asset.
    return typed.assets
      .filter((asset): asset is PackModelShape => isModelAsset(asset, typed.formatVersion))
      .map((asset) => this.toLibraryItem(asset))
  }

  private async findAsset(
    contentHash: string,
  ): Promise<{ shape: PackAssetShape; formatVersion: number | undefined } | undefined> {
    const manifest = await this.loadManifest()
    const shape = manifest?.assets.find((candidate) => candidate.contentHash === contentHash)
    return shape === undefined ? undefined : { shape, formatVersion: manifest?.formatVersion }
  }

  private loadManifest(): Promise<TypedManifest | undefined> {
    if (this.loadedManifest === undefined) {
      const attempt = this.adoptValidManifest()
      this.loadedManifest = attempt
      // Registered before any caller awaits, so a failed caller that retries already finds
      // the memo cleared; the rejection handler also keeps `attempt` from going unhandled.
      void attempt.then(
        (manifest) => {
          if (manifest === undefined) this.forgetManifest(attempt)
        },
        () => this.forgetManifest(attempt),
      )
    }
    return this.loadedManifest
  }

  private forgetManifest(attempt: Promise<TypedManifest | undefined>): void {
    if (this.loadedManifest === attempt) {
      this.loadedManifest = undefined
    }
  }

  private async adoptValidManifest(): Promise<TypedManifest | undefined> {
    const manifest = await this.fetchValidManifest()
    if (manifest !== undefined) this.scope = packScopeOf(manifest)
    return manifest
  }

  private async fetchValidManifest(): Promise<TypedManifest | undefined> {
    const manifest = await this.reader.manifest()
    return validatePackManifest(manifest).valid ? (manifest as TypedManifest) : undefined
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
