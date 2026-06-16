import { describe, expect, it } from 'vitest'
import { checkPackIntegrity } from './pack-integrity.mjs'

const HASH = 'a'.repeat(64)
const ASSET_FILE = `assets/${HASH}.glb`
const THUMBNAIL_FILE = `thumbnails/${HASH}.webp`
const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

/**
 * A fake {@link PackReader} that defaults every fact to "well formed" and lets
 * each later cycle flip one fact through per-category overrides:
 *
 * - `dirName`  replaces the pack directory basename (dir-name mismatch).
 * - `dirs`     merges over the listed files per directory (orphans).
 * - `files`    merges over the existence map (missing asset/thumbnail/required file).
 * - `hashes`   merges over the digest map (content-hash mismatch).
 * - `bytes`    merges over the thumbnail-byte map (bad WebP signature).
 * - `reader`   overrides whole reader methods if a cycle needs custom behavior.
 */
function fakeReader(overrides = {}) {
  const dirs = {
    assets: [`${HASH}.glb`],
    thumbnails: [`${HASH}.webp`],
    ...overrides.dirs,
  }
  const files = {
    [ASSET_FILE]: true,
    [THUMBNAIL_FILE]: true,
    LICENSE: true,
    NOTICE: true,
    'CHANGELOG.md': true,
    ...overrides.files,
  }
  const hashes = {
    [ASSET_FILE]: HASH,
    ...overrides.hashes,
  }
  const bytes = {
    [THUMBNAIL_FILE]: WEBP_BYTES,
    ...overrides.bytes,
  }
  return {
    dirName: overrides.dirName ?? 'vernacular-starter-1.0.0',
    listDir: async (rel) => dirs[rel] ?? [],
    exists: async (rel) => Boolean(files[rel]),
    sha256: async (rel) => hashes[rel] ?? '',
    readBytes: async (rel) => bytes[rel] ?? new Uint8Array(),
    ...overrides.reader,
  }
}

/** A manifest referencing one well-formed asset; `asset` overrides its fields. */
function manifestWith(asset = {}) {
  return {
    packId: 'vernacular-starter',
    version: '1.0.0',
    assets: [{ contentHash: HASH, name: 'Chair', ...asset }],
  }
}

describe('checkPackIntegrity', () => {
  it('reports no errors for a well-formed pack', async () => {
    const result = await checkPackIntegrity(manifestWith(), fakeReader())
    expect(result).toEqual({ errors: [] })
  })

  it('flags an asset whose bytes hash to a different digest than declared', async () => {
    const reader = fakeReader({ hashes: { [ASSET_FILE]: 'b'.repeat(64) } })
    const result = await checkPackIntegrity(manifestWith(), reader)
    expect(result.errors.length).toBeGreaterThanOrEqual(1)
    expect(result.errors.some((m) => m.includes('content hash'))).toBe(true)
  })
})
