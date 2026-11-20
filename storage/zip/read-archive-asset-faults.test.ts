// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readArchive, type ArchiveRead } from './read-archive'
import { localOffsetOfEntry, recordPushedChunks, withUint32 } from './zip-edges-test-kit'
import {
  assetEntry,
  buildZip,
  contentHashOf,
  documentEntry,
  seededBytes,
  type TestZipEntry,
} from './zip-test-kit'
import { extraBlock, wideBytes, ZIP64_BLOCK_ID } from './zip64-test-kit'

const encoder = new TextEncoder()
const DOCUMENT = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const PICTURE = seededBytes(300)
const SWATCH = encoder.encode('a small swatch of the parlor wallpaper')
const FAULTY = encoder.encode('an asset with a fault')
/** fflate refuses these bytes as an invalid block. */
const GARBAGE = new Uint8Array(64).fill(0xff)
const STORED = 0
const UNKNOWN_METHOD = 12
const ENCRYPTED = 1
const SHORT_DECLARED_BYTES = 10
const FAULTY_INDEX = 1
const NO_SIGNATURE = 0
/** One entry fewer than the default entry limit, with the document. */
const MANY_ASSETS = 9_999
const MANY_ASSETS_TIMEOUT_MS = 120_000

/** A content hash and the bytes it names. */
type HashedAsset = readonly [string, Uint8Array]

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * The kind of a failed read, or the hashes of the assets of an ok read in their order. A test
 * compares this first, so that a failure prints a short text and not every asset byte.
 */
function outcome(read: ArchiveRead): string | readonly string[] {
  return read.ok ? [...read.assets.keys()] : read.failure.kind
}

/**
 * The read is ok with `document`, and `assets` holds exactly these, in this order. The list
 * of rejected assets is left to the hash check of a later change, which fills it.
 */
function expectAssets(read: ArchiveRead, document: Uint8Array, assets: readonly HashedAsset[]) {
  expect(outcome(read)).toEqual(assets.map(([hash]) => hash))
  expect(read.ok && read.document).toEqual(document)
  expect(read.ok && read.assets).toEqual(new Map(assets))
}

async function hashed(bytes: Uint8Array): Promise<HashedAsset> {
  return [await contentHashOf(bytes), bytes]
}

function asIs(bytes: Uint8Array): Uint8Array {
  return bytes
}

/** The archive with the local header signature of the faulty entry overwritten. */
function withoutLocalSignature(bytes: Uint8Array): Uint8Array {
  return withUint32(bytes, localOffsetOfEntry(bytes, FAULTY_INDEX), NO_SIGNATURE)
}

/** The bytes of asset `index` of many: short, different for every index. */
function manyAssetBytes(index: number): Uint8Array {
  return encoder.encode(`asset number ${index}`)
}

describe('readArchive leaves out one faulty asset and reads the others', () => {
  it.each<[string, Partial<TestZipEntry>, (bytes: Uint8Array) => Uint8Array]>([
    ['a stream shorter than it declares', { declaredBytes: FAULTY.length + 1 }, asIs],
    ['a corrupt stream', { data: GARBAGE }, asIs],
    ['an unsupported method', { method: UNKNOWN_METHOD }, asIs],
    [
      'stored data shorter than it declares',
      { method: STORED, declaredBytes: FAULTY.length + 1 },
      asIs,
    ],
    ['the encrypted flag', { flags: ENCRYPTED }, asIs],
    [
      'a ZIP64 compressed size of 2^40',
      { zip64: ['compressedBytes'], zip64Values: { compressedBytes: 2n ** 40n } },
      asIs,
    ],
    [
      'a ZIP64 local header offset of 2^60',
      { zip64: ['localOffset'], zip64Values: { localOffset: 2n ** 60n } },
      asIs,
    ],
    ['a wrong local header signature', {}, withoutLocalSignature],
  ])('an asset with %s is left out', async (_case, overrides, patch) => {
    const entries = [
      await assetEntry(PICTURE),
      await assetEntry(FAULTY, overrides),
      documentEntry(DOCUMENT),
      await assetEntry(SWATCH, { method: STORED }),
    ]
    const bytes = patch(buildZip(entries))

    const assets = [await hashed(PICTURE), await hashed(SWATCH)]
    expectAssets(await readArchive(bytes), DOCUMENT, assets)
  })

  it('a sound entry does not stand in for a first entry of its name that failed', async () => {
    const first = await assetEntry(PICTURE, { data: GARBAGE })
    const bytes = buildZip([documentEntry(DOCUMENT), first, await assetEntry(PICTURE)])

    expectAssets(await readArchive(bytes), DOCUMENT, [])
  })
})

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

      expectAssets(await readArchive(bytes), DOCUMENT, assets)
    },
    MANY_ASSETS_TIMEOUT_MS,
  )
})
