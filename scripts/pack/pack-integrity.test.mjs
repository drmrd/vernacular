import { describe, expect, it } from 'vitest'
import { checkPackIntegrity, isWebp } from './pack-integrity.mjs'

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

  it('flags an asset whose declared file is missing from the pack', async () => {
    const reader = fakeReader({ files: { [ASSET_FILE]: false } })
    const result = await checkPackIntegrity(manifestWith(), reader)
    expect(result.errors.some((m) => m.includes('asset file missing'))).toBe(true)
  })

  it('flags an asset whose thumbnail is missing from the pack', async () => {
    const reader = fakeReader({ files: { [THUMBNAIL_FILE]: false } })
    const result = await checkPackIntegrity(manifestWith(), reader)
    expect(result.errors.some((m) => m.includes('thumbnail missing'))).toBe(true)
  })

  it('flags a present thumbnail whose bytes are not a valid WebP signature', async () => {
    const notWebp = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const reader = fakeReader({ bytes: { [THUMBNAIL_FILE]: notWebp } })
    const result = await checkPackIntegrity(manifestWith(), reader)
    expect(result.errors.some((m) => m.includes('not valid WebP'))).toBe(true)
  })

  it('flags files in assets and thumbnails that the manifest does not reference', async () => {
    const reader = fakeReader({
      dirs: {
        assets: [`${HASH}.glb`, 'orphan.glb'],
        thumbnails: [`${HASH}.webp`, 'stray.webp'],
      },
    })
    const result = await checkPackIntegrity(manifestWith(), reader)
    expect(result.errors.some((m) => m.includes('orphan.glb'))).toBe(true)
    expect(result.errors.some((m) => m.includes('stray.webp'))).toBe(true)
  })

  it('flags a pack missing its NOTICE file', async () => {
    const reader = fakeReader({ files: { NOTICE: false } })
    const result = await checkPackIntegrity(manifestWith(), reader)
    expect(result.errors.some((m) => m.includes('NOTICE'))).toBe(true)
  })

  it('checks each required pack file by name', async () => {
    for (const name of ['LICENSE', 'NOTICE', 'CHANGELOG.md']) {
      const reader = fakeReader({ files: { [name]: false } })
      const result = await checkPackIntegrity(manifestWith(), reader)
      expect(result.errors.some((m) => m.includes(name))).toBe(true)
    }
  })

  it('flags a pack directory whose name does not match the packId and version', async () => {
    const reader = fakeReader({ dirName: 'wrong-name' })
    const result = await checkPackIntegrity(manifestWith(), reader)
    expect(result.errors.some((m) => m.includes('vernacular-starter-1.0.0'))).toBe(true)
  })
})

describe('checkPackIntegrity for a format 2 asset', () => {
  const OTHER_HASH = 'c'.repeat(64)
  const textureFile = (extension, hash = HASH) => `assets/${hash}.${extension}`
  const TEXTURE = { kind: 'texture', name: 'Grass', mediaType: 'image/png' }
  const MODEL = { kind: 'furniture', mediaType: 'model/gltf-binary' }

  /** A format 2 pack whose only asset is stored as `assets/<hash>.<extension>`. */
  function formatTwoPack(asset, extension, overrides = {}) {
    const file = textureFile(extension)
    const manifest = { ...manifestWith(asset), formatVersion: 2 }
    const reader = fakeReader({
      ...overrides,
      dirs: { assets: [`${HASH}.${extension}`], ...overrides.dirs },
      files: { [ASSET_FILE]: false, [file]: true, ...overrides.files },
      hashes: { [file]: HASH, ...overrides.hashes },
    })
    return { manifest, reader }
  }

  it.each([
    ['an image/png texture', { ...TEXTURE, mediaType: 'image/png' }, 'png'],
    ['an image/webp texture', { ...TEXTURE, mediaType: 'image/webp' }, 'webp'],
    ['a model/gltf-binary model', MODEL, 'glb'],
  ])('reads %s from the file with the .%s extension', async (_label, asset, extension) => {
    const { manifest, reader } = formatTwoPack(asset, extension)
    const result = await checkPackIntegrity(manifest, reader)
    expect(result).toEqual({ errors: [] })
  })

  it('flags a texture whose bytes hash to a different digest than declared', async () => {
    const file = textureFile('png')
    const { manifest, reader } = formatTwoPack(TEXTURE, 'png', {
      hashes: { [file]: 'b'.repeat(64) },
    })
    const result = await checkPackIntegrity(manifest, reader)
    expect(
      result.errors.some((m) => m.includes('content hash does not match') && m.includes(file)),
    ).toBe(true)
  })

  it('flags a texture whose file is missing and names the expected path', async () => {
    const file = textureFile('png')
    const { manifest, reader } = formatTwoPack(TEXTURE, 'png', { files: { [file]: false } })
    const result = await checkPackIntegrity(manifest, reader)
    expect(result.errors.some((m) => m.includes('asset file missing') && m.includes(file))).toBe(
      true,
    )
  })

  it('reports a stray .glb as an orphan but not the referenced .png', async () => {
    const { manifest, reader } = formatTwoPack(TEXTURE, 'png', {
      dirs: { assets: [`${HASH}.png`, `${OTHER_HASH}.glb`] },
    })
    const result = await checkPackIntegrity(manifest, reader)
    expect(result.errors.some((m) => m.includes(`${OTHER_HASH}.glb`))).toBe(true)
    expect(result.errors.some((m) => m.includes(`${HASH}.png`))).toBe(false)
  })

  it('requires a thumbnail for a model but not for a texture', async () => {
    const texturePath = textureFile('png', OTHER_HASH)
    const manifest = {
      ...manifestWith(MODEL),
      formatVersion: 2,
      assets: [
        { contentHash: HASH, name: 'Chair', ...MODEL },
        { contentHash: OTHER_HASH, ...TEXTURE },
      ],
    }
    const reader = fakeReader({
      dirs: { assets: [`${HASH}.glb`, `${OTHER_HASH}.png`], thumbnails: [] },
      files: { [THUMBNAIL_FILE]: false, [texturePath]: true },
      hashes: { [texturePath]: OTHER_HASH },
    })
    const result = await checkPackIntegrity(manifest, reader)
    const missing = result.errors.filter((m) => m.includes('thumbnail missing'))
    expect(missing).toHaveLength(1)
    expect(missing[0]).toContain(HASH)
    expect(result.errors).toEqual(missing)
  })

  const NO_THUMBNAIL = { files: { [THUMBNAIL_FILE]: false }, dirs: { thumbnails: [] } }

  it.each(['architectural-element', 'trim-profile'])(
    'requires a thumbnail for a %s model',
    async (kind) => {
      const { manifest, reader } = formatTwoPack({ ...MODEL, kind }, 'glb', NO_THUMBNAIL)
      const result = await checkPackIntegrity(manifest, reader)
      expect(result.errors.some((m) => m.includes('thumbnail missing'))).toBe(true)
    },
  )

  it('accepts an image/webp texture that has no thumbnail', async () => {
    const asset = { ...TEXTURE, mediaType: 'image/webp' }
    const { manifest, reader } = formatTwoPack(asset, 'webp', NO_THUMBNAIL)
    const result = await checkPackIntegrity(manifest, reader)
    expect(result).toEqual({ errors: [] })
  })

  it('accepts a texture with a valid WebP thumbnail at the usual path', async () => {
    const { manifest, reader } = formatTwoPack(TEXTURE, 'png')
    const result = await checkPackIntegrity(manifest, reader)
    expect(result).toEqual({ errors: [] })
  })

  it.each([
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('flags an %s texture thumbnail that is not a valid WebP signature', async (mediaType, ext) => {
    const notWebp = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const { manifest, reader } = formatTwoPack({ ...TEXTURE, mediaType }, ext, {
      bytes: { [THUMBNAIL_FILE]: notWebp },
    })
    const result = await checkPackIntegrity(manifest, reader)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('not valid WebP')
    expect(result.errors[0]).toContain(HASH)
  })

  it('does not look for a thumbnail of an asset whose content hash is malformed', async () => {
    const { manifest, reader } = formatTwoPack(MODEL, 'glb', NO_THUMBNAIL)
    manifest.assets[0].contentHash = 'not-a-hash'
    const result = await checkPackIntegrity(manifest, reader)
    expect(result.errors.filter((m) => m.includes('thumbnail'))).toEqual([])
  })
})

describe('isWebp', () => {
  it('accepts a RIFF....WEBP signature of at least 12 bytes', () => {
    expect(isWebp(WEBP_BYTES)).toBe(true)
  })

  it('rejects 12 bytes that do not carry the RIFF/WEBP signature', () => {
    expect(isWebp(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBe(false)
  })

  it('rejects input shorter than the 12-byte header', () => {
    expect(isWebp(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false)
  })
})
