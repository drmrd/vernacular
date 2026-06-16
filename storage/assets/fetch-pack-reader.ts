import type { PackReader } from './pack-source'

async function fetchBytes(fetchFn: typeof fetch, url: string): Promise<Uint8Array | undefined> {
  const response = await fetchFn(url)
  if (!response.ok) {
    return undefined
  }
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Builds a PackReader that reads a pack served as static files under `baseUrl`
 * (manifest.json, assets/<hash>.glb, thumbnails/<hash>.webp) through an injected
 * fetch. A non-ok asset/thumbnail response reads as undefined; a non-ok manifest
 * reads as an empty object so PackSource treats it as an invalid (empty) pack.
 */
export function createFetchPackReader(baseUrl: string, fetchFn: typeof fetch): PackReader {
  return {
    async manifest() {
      const response = await fetchFn(`${baseUrl}/manifest.json`)
      if (!response.ok) {
        return {}
      }
      return response.json() as Promise<unknown>
    },
    readAsset(contentHash) {
      return fetchBytes(fetchFn, `${baseUrl}/assets/${contentHash}.glb`)
    },
    readThumbnail(contentHash) {
      return fetchBytes(fetchFn, `${baseUrl}/thumbnails/${contentHash}.webp`)
    },
  }
}
