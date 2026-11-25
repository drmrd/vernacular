// core/assets/pack-manifest-shape.ts
//
// The typed reading of a pack manifest that already passed validatePackManifest,
// and the files an asset names beyond its own content (its thumbnail). Pure.

import type { AssetKind } from './pack-manifest.ts'
import { validatePackManifest } from './pack-manifest.ts'
import type { TextureDescription } from './asset-description.ts'

const FORMAT_ONE = 1

export interface NamedFile {
  contentHash: string
  byteLength?: number
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
  mediaType?: string
  dimensions?: { width: number; depth: number; height: number }
  image?: TextureDescription['image']
  tileSize?: TextureDescription['tileSize']
  colorSpace?: TextureDescription['colorSpace']
  byteLength?: number
  thumbnail?: { contentHash: string; byteLength: number }
  copyright?: string
  changes?: string
}

export interface ReadablePackManifest {
  formatVersion: number
  packId: string
  version: string
  license: string
  attribution: string
  eras: string[]
  categories: string[]
  assets: [ReadablePackAsset, ...ReadablePackAsset[]]
}

/** The typed manifest, or undefined when the value fails validatePackManifest. */
export function readPackManifest(value: unknown): ReadablePackManifest | undefined {
  if (!validatePackManifest(value).valid) return undefined
  const manifest = value as ReadablePackManifest
  return { ...manifest, formatVersion: manifest.formatVersion ?? FORMAT_ONE }
}

/** The files an asset names: its own content first, then its thumbnail when present. */
export function namedFiles(asset: ReadablePackAsset): readonly NamedFile[] {
  const { contentHash, byteLength } = asset
  const own: NamedFile = byteLength === undefined ? { contentHash } : { contentHash, byteLength }
  return asset.thumbnail === undefined ? [own] : [own, asset.thumbnail]
}
