// core/assets/pack-manifest-shape.ts
//
// The typed reading of a pack manifest that already passed validatePackManifest,
// and the files each asset names. Pure.

import type { AssetKind, PACK_FORMAT_VERSIONS } from './pack-manifest.ts'
import { validatePackManifest } from './pack-manifest.ts'
import type { MediaType, ModelDescription, TextureDescription } from './asset-description.ts'
import { assetFileName, packAssetMediaType } from './asset-description.ts'

const FORMAT_ONE = 1

export interface NamedFile {
  contentHash: string
  byteLength?: number
}

interface NamedFileWithSource {
  file: NamedFile
  sourcePath: string
}

export interface ReadablePackAsset {
  contentHash: string
  name: string
  license: string
  attribution: string
  eras: string[]
  styles?: string[]
  categories: string[]
  sourceUrl?: string
  kind: AssetKind
  mediaType?: MediaType
  dimensions?: ModelDescription['dimensions']
  image?: TextureDescription['image']
  tileSize?: TextureDescription['tileSize']
  colorSpace?: TextureDescription['colorSpace']
  byteLength?: number
  thumbnail?: { contentHash: string; byteLength: number }
  copyright?: string
  changes?: string
}

export interface ReadablePackManifest {
  formatVersion: (typeof PACK_FORMAT_VERSIONS)[number]
  packId: string
  version: string
  license: string
  attribution: string
  eras: string[]
  categories: string[]
  assets: ReadablePackAsset[]
}

/**
 * The typed manifest, or undefined when the value fails validatePackManifest.
 * Unknown keys are kept, and `assets` is the input's own array, not a copy.
 */
export function readPackManifest(value: unknown): ReadablePackManifest | undefined {
  if (!validatePackManifest(value).valid) return undefined
  const manifest = value as ReadablePackManifest
  return { ...manifest, formatVersion: manifest.formatVersion ?? FORMAT_ONE }
}

/** The files an asset names: its own content first, then its thumbnail when present. */
export function namedFiles(asset: ReadablePackAsset): readonly NamedFile[] {
  return namedFilesWithSources(asset).map(({ file }) => file)
}

export function namedFilesWithSources(asset: ReadablePackAsset): readonly NamedFileWithSource[] {
  const { contentHash, byteLength, thumbnail } = asset
  const own = {
    file: byteLength === undefined ? { contentHash } : { contentHash, byteLength },
    sourcePath: `assets/${assetFileName(contentHash, packAssetMediaType(asset))}`,
  }
  if (thumbnail === undefined) return [own]
  return [
    own,
    {
      file: { contentHash: thumbnail.contentHash, byteLength: thumbnail.byteLength },
      sourcePath: `thumbnails/${assetFileName(contentHash, 'image/webp')}`,
    },
  ]
}
