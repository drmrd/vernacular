// Shared MSW request handlers for the app's pack-fetch surface. Used by both
// the browser-mode Storybook component run and the node-level Vitest unit test
// to serve a deterministic, valid pack manifest in place of a real network
// read. It imports only `msw` and pure data: no React, no Three.js.

import { http, HttpResponse } from 'msw'
import type { RequestHandler } from 'msw'
import type { AssetKind } from '../../core/assets/pack-manifest'

const PACK_ID = 'vernacular-starter'
const PACK_VERSION = '1.0.0'
const PACK_LICENSE = 'CC0-1.0'
const PACK_ATTRIBUTION = 'Vernacular project'
const PACK_ERAS = Object.freeze(['mid-century'])
const PACK_CATEGORIES = Object.freeze(['seating'])

const DEFAULT_ERROR_STATUS = 500

const ASSET_KIND: AssetKind = 'furniture'
const ASSET_WIDTH_MM = 500
const ASSET_DEPTH_MM = 520
const ASSET_HEIGHT_MM = 800

interface ManifestAsset {
  contentHash: string
  name: string
}

interface ManifestDimensions {
  width: number
  depth: number
  height: number
}

interface ServedManifestAsset {
  contentHash: string
  name: string
  kind: AssetKind
  license: string
  attribution: string
  eras: readonly string[]
  categories: readonly string[]
  dimensions: ManifestDimensions
}

interface ServedManifest {
  packId: string
  version: string
  license: string
  attribution: string
  eras: readonly string[]
  categories: readonly string[]
  assets: ServedManifestAsset[]
}

function buildManifestAsset(asset: ManifestAsset): ServedManifestAsset {
  return {
    contentHash: asset.contentHash,
    name: asset.name,
    kind: ASSET_KIND,
    license: PACK_LICENSE,
    attribution: PACK_ATTRIBUTION,
    eras: PACK_ERAS,
    categories: PACK_CATEGORIES,
    dimensions: { width: ASSET_WIDTH_MM, depth: ASSET_DEPTH_MM, height: ASSET_HEIGHT_MM },
  }
}

function buildManifest(assets: ManifestAsset[]): ServedManifest {
  return {
    packId: PACK_ID,
    version: PACK_VERSION,
    license: PACK_LICENSE,
    attribution: PACK_ATTRIBUTION,
    eras: PACK_ERAS,
    categories: PACK_CATEGORIES,
    assets: assets.map(buildManifestAsset),
  }
}

/**
 * MSW handlers that serve a valid pack manifest listing exactly `assets`, in
 * order, at `GET ${base}/manifest.json`.
 */
export function packHandlers(options: {
  base: string
  assets: ManifestAsset[]
}): RequestHandler[] {
  const manifest = buildManifest(options.assets)
  return [http.get(`${options.base}/manifest.json`, () => HttpResponse.json(manifest))]
}

/**
 * MSW handlers that respond with a non-ok status (default 500) at
 * `GET ${base}/manifest.json`, so the fetch-backed reader surfaces an empty pack.
 */
export function packErrorHandlers(options: {
  base: string
  status?: number
}): RequestHandler[] {
  const status = options.status ?? DEFAULT_ERROR_STATUS
  return [http.get(`${options.base}/manifest.json`, () => new HttpResponse(null, { status }))]
}
