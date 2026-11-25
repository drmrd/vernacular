import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkPackIntegrity } from './pack-integrity.mjs'
import { TEXTURE_SIDE, rgbPng, thumbnailSignature } from './texture-test-bytes.mjs'

const MODEL_BYTES = Uint8Array.of(1, 2, 3)
const TEXTURE_BYTES = rgbPng(TEXTURE_SIDE)
const THUMBNAIL_BYTES = thumbnailSignature()
const MODEL_HASH = sha256(MODEL_BYTES)
const TEXTURE_HASH = sha256(TEXTURE_BYTES)
const THUMBNAIL_HASH = sha256(THUMBNAIL_BYTES)
const OTHER_HASH = 'c'.repeat(64)
const MODEL_FILE = { name: `${MODEL_HASH}.glb`, bytes: MODEL_BYTES }
const TEXTURE_FILE = { name: `${TEXTURE_HASH}.png`, bytes: TEXTURE_BYTES }
const DECLARED_THUMBNAIL = { contentHash: THUMBNAIL_HASH, byteLength: THUMBNAIL_BYTES.length }
const WRONG_LENGTH = 999
const TEXTURE_TILE_SIZE_MM = 1000

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function readerFor(asset = MODEL_FILE, { hasThumbnail = true } = {}) {
  const emptyText = new Uint8Array()
  const files = new Map([
    [`assets/${asset.name}`, asset.bytes],
    ['LICENSE', emptyText],
    ['NOTICE', emptyText],
    ['CHANGELOG.md', emptyText],
  ])
  if (hasThumbnail) {
    const assetHash = posix.parse(asset.name).name
    files.set(`thumbnails/${assetHash}.webp`, THUMBNAIL_BYTES)
  }

  function bytesAt(relative) {
    const bytes = files.get(relative)
    if (!bytes) throw new Error(`Missing fixture file: ${relative}`)
    return bytes
  }

  return {
    dirName: 'chair-pack-1.0.0',
    listDir: async (directory) =>
      [...files.keys()]
        .filter((relative) => posix.dirname(relative) === posix.normalize(directory))
        .map((relative) => posix.basename(relative)),
    exists: async (relative) => files.has(relative),
    sha256: async (relative) => sha256(bytesAt(relative)),
    readBytes: async (relative, length) => bytesAt(relative).subarray(0, length),
    size: async (relative) => bytesAt(relative).length,
  }
}

function manifestWith(fields, formatVersion = 2) {
  const asset = { contentHash: MODEL_HASH, kind: 'model', name: 'Chair', ...fields }
  return { packId: 'chair-pack', version: '1.0.0', formatVersion, assets: [asset] }
}

function textureManifestWith(fields) {
  return manifestWith({
    contentHash: TEXTURE_HASH,
    kind: 'texture',
    name: 'Gray stone',
    mediaType: 'image/png',
    image: { width: TEXTURE_SIDE, height: TEXTURE_SIDE },
    tileSize: { width: TEXTURE_TILE_SIZE_MM, height: TEXTURE_TILE_SIZE_MM },
    colorSpace: 'srgb',
    byteLength: TEXTURE_BYTES.length,
    ...fields,
  })
}

async function errorsFor(fields, formatVersion = 2) {
  const result = await checkPackIntegrity(manifestWith(fields, formatVersion), readerFor())
  return result.errors
}

describe('checkPackIntegrity for the stated length and thumbnail fields of a format 2 asset', () => {
  it('reports one error when byteLength differs from the size of the model file', async () => {
    const errors = await errorsFor({ byteLength: WRONG_LENGTH })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(new RegExp(`^asset ${MODEL_HASH}: byteLength`))
  })

  it('reports one error when thumbnail.contentHash differs from the digest of the thumbnail file', async () => {
    const thumbnail = { contentHash: OTHER_HASH, byteLength: THUMBNAIL_BYTES.length }
    const errors = await errorsFor({ thumbnail })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(new RegExp(`^asset ${MODEL_HASH}: thumbnail\\.contentHash`))
  })

  it('reports one error when thumbnail.byteLength differs from the size of the thumbnail file', async () => {
    const thumbnail = { contentHash: THUMBNAIL_HASH, byteLength: WRONG_LENGTH }
    const errors = await errorsFor({ thumbnail })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(new RegExp(`^asset ${MODEL_HASH}: thumbnail\\.byteLength`))
  })

  it('reports no error when every stated value equals the file', async () => {
    const thumbnail = { contentHash: THUMBNAIL_HASH, byteLength: THUMBNAIL_BYTES.length }
    const errors = await errorsFor({ byteLength: MODEL_BYTES.length, thumbnail })
    expect(errors).toEqual([])
  })

  it('reports no error when the fields are absent', async () => {
    expect(await errorsFor({})).toEqual([])
  })
})

describe('checkPackIntegrity for the stated fields outside the format 2 happy path', () => {
  it('reports one error for a wrong byteLength in a format 1 pack', async () => {
    const errors = await errorsFor({ byteLength: WRONG_LENGTH }, 1)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(new RegExp(`^asset ${MODEL_HASH}: byteLength`))
  })

  it.each([
    ['declared', { thumbnail: DECLARED_THUMBNAIL }],
    ['undeclared', {}],
  ])('reports one error when a %s model thumbnail is missing from the pack', async (_, fields) => {
    const reader = readerFor(MODEL_FILE, { hasThumbnail: false })
    const result = await checkPackIntegrity(manifestWith(fields), reader)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(new RegExp(`^asset ${MODEL_HASH}: thumbnail missing`))
  })

  it('reports one error when a stated texture thumbnail is missing from the pack', async () => {
    const reader = readerFor(TEXTURE_FILE, { hasThumbnail: false })
    const manifest = textureManifestWith({ thumbnail: DECLARED_THUMBNAIL })
    const result = await checkPackIntegrity(manifest, reader)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(new RegExp(`^asset ${TEXTURE_HASH}: thumbnail missing`))
  })

  it('reports no error when an undeclared texture thumbnail is missing from the pack', async () => {
    const reader = readerFor(TEXTURE_FILE, { hasThumbnail: false })
    const result = await checkPackIntegrity(textureManifestWith({}), reader)
    expect(result.errors).toEqual([])
  })
})
