// storage/assets/msw-pack-handlers.ts
//
// Shared MSW request handlers for the app's pack-fetch surface. Used by both
// the browser-mode Storybook component run and the node-level Vitest unit test
// to serve a deterministic, valid pack manifest in place of a real network
// read. It imports only `msw` and pure data: no React, no Three.js.

import { http, HttpResponse } from 'msw'
import type { RequestHandler } from 'msw'

const PACK_ID = 'vernacular-starter'
const PACK_VERSION = '1.0.0'
const PACK_LICENSE = 'CC0-1.0'
const PACK_ATTRIBUTION = 'Vernacular project'
const PACK_ERAS = ['mid-century']
const PACK_CATEGORIES = ['seating']

const ASSET_KIND = 'furniture'
const ASSET_WIDTH_MM = 500
const ASSET_DEPTH_MM = 520
const ASSET_HEIGHT_MM = 800

interface ManifestAsset {
  contentHash: string
  name: string
}

function buildManifestAsset(asset: ManifestAsset): Record<string, unknown> {
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

function buildManifest(assets: ManifestAsset[]): Record<string, unknown> {
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
