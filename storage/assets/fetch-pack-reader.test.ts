import { describe, expect, it } from 'vitest'
import type { MediaType } from '../../core'
import { createFetchPackReader } from './fetch-pack-reader'

const BASE = '/packs/vernacular-starter-1.0.0'
const HASH = 'a'.repeat(64)
const MANIFEST = { packId: 'vernacular-starter', version: '1.0.0' }
const ASSET_BYTES = Uint8Array.of(1, 2, 3, 4)
const THUMB_BYTES = Uint8Array.of(9, 9)

function fakeFetch(routes: Record<string, Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const res = routes[url]
    return res ?? new Response(null, { status: 404 })
  }) as typeof fetch
}

function trackingFakeFetch(routes: Record<string, Response>): {
  fetch: typeof fetch
  requestedUrls: string[]
} {
  const requestedUrls: string[] = []
  const fetchFn = (async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input))
    return fakeFetch(routes)(input)
  }) as typeof fetch
  return { fetch: fetchFn, requestedUrls }
}

const ASSET_ROWS: ReadonlyArray<{ mediaType: MediaType; url: string }> = [
  { mediaType: 'model/gltf-binary', url: `${BASE}/assets/${HASH}.glb` },
  { mediaType: 'image/png', url: `${BASE}/assets/${HASH}.png` },
  { mediaType: 'image/webp', url: `${BASE}/assets/${HASH}.webp` },
]

describe('createFetchPackReader', () => {
  it('fetches the manifest JSON from <baseUrl>/manifest.json', async () => {
    const routes: Record<string, Response> = {
      [`${BASE}/manifest.json`]: new Response(JSON.stringify(MANIFEST), { status: 200 }),
    }
    const { fetch: trackingFetch, requestedUrls } = trackingFakeFetch(routes)

    const reader = createFetchPackReader(BASE, trackingFetch)
    const result = await reader.manifest()

    expect(requestedUrls).toEqual([`${BASE}/manifest.json`])
    expect(result).toEqual(MANIFEST)
  })

  it.each(ASSET_ROWS)(
    'fetches an asset at the extension of its media type ($mediaType)',
    async ({ mediaType, url }) => {
      const routes: Record<string, Response> = {
        [url]: new Response(ASSET_BYTES, { status: 200 }),
      }
      const { fetch: trackingFetch, requestedUrls } = trackingFakeFetch(routes)

      const reader = createFetchPackReader(BASE, trackingFetch)
      const result = await reader.readAsset(HASH, mediaType)

      expect(requestedUrls).toEqual([url])
      expect(result).toEqual(ASSET_BYTES)
    },
  )

  it('resolves undefined for readAsset when the server returns a non-ok response', async () => {
    const reader = createFetchPackReader(BASE, fakeFetch({}))
    const result = await reader.readAsset('missing', 'model/gltf-binary')
    expect(result).toBeUndefined()
  })

  it('fetches the thumbnail bytes from <baseUrl>/thumbnails/<hash>.webp', async () => {
    const routes: Record<string, Response> = {
      [`${BASE}/thumbnails/${HASH}.webp`]: new Response(THUMB_BYTES, { status: 200 }),
    }
    const { fetch: trackingFetch, requestedUrls } = trackingFakeFetch(routes)

    const reader = createFetchPackReader(BASE, trackingFetch)
    const result = await reader.readThumbnail(HASH)

    expect(requestedUrls).toEqual([`${BASE}/thumbnails/${HASH}.webp`])
    expect(result).toEqual(THUMB_BYTES)
  })

  it('resolves undefined for readThumbnail when the server returns a non-ok response', async () => {
    const reader = createFetchPackReader(BASE, fakeFetch({}))
    const result = await reader.readThumbnail('missing')
    expect(result).toBeUndefined()
  })
})
