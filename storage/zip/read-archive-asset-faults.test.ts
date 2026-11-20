// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readArchive, type ArchiveRead } from './read-archive'
import { expectRead, recordPushedChunks, type HashedAsset } from './zip-edges-test-kit'
import { assetEntry, buildZip, contentHashOf, documentEntry, seededBytes } from './zip-test-kit'
import { extraBlock, wideBytes, ZIP64_BLOCK_ID } from './zip64-test-kit'

const encoder = new TextEncoder()
const DOCUMENT = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const PICTURE = seededBytes(300)
/** fflate refuses these bytes as an invalid block. */
const GARBAGE = new Uint8Array(64).fill(0xff)
const STORED = 0
const SHORT_DECLARED_BYTES = 10
/** One entry fewer than the default entry limit, with the document. */
const MANY_ASSETS = 9_999
const MANY_ASSETS_TIMEOUT_MS = 120_000

afterEach(() => {
  vi.restoreAllMocks()
})

/** The kind of a failed read, or the hashes of the assets of an ok read in their order. */
function outcome(read: ArchiveRead): string | readonly string[] {
  return read.ok ? [...read.assets.keys()] : read.failure.kind
}

async function hashed(bytes: Uint8Array): Promise<HashedAsset> {
  return [await contentHashOf(bytes), bytes]
}

/** The bytes of asset `index` of many: short, different for every index. */
function manyAssetBytes(index: number): Uint8Array {
  return encoder.encode(`asset number ${index}`)
}

describe('readArchive refuses the whole archive for an asset that lies about its size', () => {
  it('refuses an asset that passes its declared size before the document in the directory', async () => {
    const liar = await assetEntry(PICTURE, { declaredBytes: SHORT_DECLARED_BYTES })
    const bytes = buildZip([liar, documentEntry(DOCUMENT)])

    expect(outcome(await readArchive(bytes))).toBe('not-an-archive')
  })

  it('refuses a corrupt document and pushes nothing of an asset after it that passes its declared size', async () => {
    const liar = await assetEntry(PICTURE, { declaredBytes: SHORT_DECLARED_BYTES })
    const bytes = buildZip([documentEntry(DOCUMENT, { data: GARBAGE }), liar])
    const pushed = recordPushedChunks()

    expect(outcome(await readArchive(bytes))).toBe('not-an-archive')
    expect(pushed().bytes).toBeLessThanOrEqual(GARBAGE.length)
  })

  it('refuses an asset entry whose ZIP64 block is too short for its markers', async () => {
    const shortBlock = extraBlock(ZIP64_BLOCK_ID, wideBytes([PICTURE.length]))
    const asset = await assetEntry(PICTURE, {
      zip64: ['declaredBytes', 'compressedBytes'],
      centralExtra: shortBlock,
    })
    const bytes = buildZip([documentEntry(DOCUMENT), asset])

    expect(outcome(await readArchive(bytes))).toBe('not-an-archive')
  })
})

describe('readArchive reads as many assets as the entry limit allows', () => {
  it(
    'reads 9,999 assets, stored and deflated in turn, in the order of the directory',
    async () => {
      const assets = await Promise.all(
        Array.from({ length: MANY_ASSETS }, (_, index) => hashed(manyAssetBytes(index))),
      )
      const entries = await Promise.all(
        assets.map(([, bytes], index) =>
          assetEntry(bytes, index % 2 === 0 ? { method: STORED } : {}),
        ),
      )
      const bytes = buildZip([documentEntry(DOCUMENT), ...entries])

      expectRead(await readArchive(bytes), { document: DOCUMENT, assets, rejectedAssets: [] })
    },
    MANY_ASSETS_TIMEOUT_MS,
  )
})
