import { describe, expect, it } from 'vitest'
import { checkPackIntegrity } from './pack-integrity.mjs'
import { thumbnailSignature } from './texture-test-bytes.mjs'

const HASH = 'a'.repeat(64)
const THUMBNAIL_HASH = 'b'.repeat(64)
const OTHER_HASH = 'c'.repeat(64)
const MODEL_FILE = `assets/${HASH}.glb`
const THUMBNAIL_FILE = `thumbnails/${HASH}.webp`
const MODEL_BYTES = Uint8Array.of(1, 2, 3)
const THUMBNAIL_BYTES = thumbnailSignature()
const WRONG_LENGTH = 999

/** A reader for a pack with one model and its thumbnail, with known sizes and digests. */
function readerWithModelAndThumbnail() {
  const files = new Set([MODEL_FILE, THUMBNAIL_FILE, 'LICENSE', 'NOTICE', 'CHANGELOG.md'])
  const digests = { [MODEL_FILE]: HASH, [THUMBNAIL_FILE]: THUMBNAIL_HASH }
  return {
    dirName: 'chair-pack-1.0.0',
    listDir: async (relative) =>
      ({ assets: [`${HASH}.glb`], thumbnails: [`${HASH}.webp`] })[relative] ?? [],
    exists: async (relative) => files.has(relative),
    sha256: async (relative) => digests[relative] ?? '',
    readBytes: async (relative) => (relative === MODEL_FILE ? MODEL_BYTES : THUMBNAIL_BYTES),
    size: async (relative) =>
      relative === MODEL_FILE ? MODEL_BYTES.length : THUMBNAIL_BYTES.length,
  }
}

function manifestWith(fields, formatVersion = 2) {
  const asset = { contentHash: HASH, kind: 'model', name: 'Chair', ...fields }
  return { packId: 'chair-pack', version: '1.0.0', formatVersion, assets: [asset] }
}

async function errorsFor(fields, formatVersion = 2) {
  const result = await checkPackIntegrity(
    manifestWith(fields, formatVersion),
    readerWithModelAndThumbnail(),
  )
  return result.errors
}

describe('checkPackIntegrity for the stated length and thumbnail fields of a format 2 asset', () => {
  it('reports one error when byteLength differs from the size of the model file', async () => {
    const errors = await errorsFor({ byteLength: WRONG_LENGTH })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(new RegExp(`^asset ${HASH}: byteLength`))
  })

  it('reports one error when thumbnail.contentHash differs from the digest of the thumbnail file', async () => {
    const thumbnail = { contentHash: OTHER_HASH, byteLength: THUMBNAIL_BYTES.length }
    const errors = await errorsFor({ thumbnail })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(new RegExp(`^asset ${HASH}: thumbnail\\.contentHash`))
  })

  it('reports one error when thumbnail.byteLength differs from the size of the thumbnail file', async () => {
    const thumbnail = { contentHash: THUMBNAIL_HASH, byteLength: WRONG_LENGTH }
    const errors = await errorsFor({ thumbnail })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(new RegExp(`^asset ${HASH}: thumbnail\\.byteLength`))
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
    expect(errors[0]).toMatch(new RegExp(`^asset ${HASH}: byteLength`))
  })

  it('reports one error when a stated thumbnail file is missing from the pack', async () => {
    const reader = readerWithModelAndThumbnail()
    const exists = reader.exists
    reader.exists = async (relative) => relative !== THUMBNAIL_FILE && exists(relative)
    const thumbnail = { contentHash: THUMBNAIL_HASH, byteLength: THUMBNAIL_BYTES.length }
    const result = await checkPackIntegrity(manifestWith({ thumbnail }), reader)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(new RegExp(`^asset ${HASH}: thumbnail missing`))
  })
})
