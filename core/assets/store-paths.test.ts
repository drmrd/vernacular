import { describe, expect, it } from 'vitest'
import { CATALOG_FILE, blobPath, manifestPath, packTextPath } from './store-paths.ts'

const MANIFEST_HASH = 'a'.repeat(64)
const CONTENT_HASH = 'b'.repeat(64)
const PACK_ID = 'example-furniture'
const PACK_VERSION = '1.0.0'

describe('store paths', () => {
  it('names the catalog, manifest, blob, and pack text files at their public paths', () => {
    expect(CATALOG_FILE).toBe('catalog.json')
    expect(manifestPath(MANIFEST_HASH)).toBe(`manifests/sha256/${MANIFEST_HASH}.json`)
    expect(blobPath(CONTENT_HASH)).toBe(`blobs/sha256/${CONTENT_HASH}`)
    expect(packTextPath(PACK_ID, PACK_VERSION, 'LICENSE')).toBe(
      'packs/example-furniture-1.0.0/LICENSE',
    )
    expect(packTextPath(PACK_ID, PACK_VERSION, 'NOTICE')).toBe(
      'packs/example-furniture-1.0.0/NOTICE',
    )
    expect(packTextPath(PACK_ID, PACK_VERSION, 'CHANGELOG.md')).toBe(
      'packs/example-furniture-1.0.0/CHANGELOG.md',
    )
  })
})
