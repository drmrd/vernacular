// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { deflateSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assetEntryName } from './archive-layout'
import { NAMES_OUTSIDE_THE_LAYOUT } from './archive-names-test-kit'
import { readArchive, type ArchiveRead } from './read-archive'
import { hashed, otherHash } from './read-archive-test-kit'
import {
  buildSharedZip,
  centralEntryOffsets,
  expectRead,
  recordPushedChunks,
  storedBlock,
  withUint32,
} from './zip-edges-test-kit'
import {
  assetEntry,
  buildZip,
  contentHashOf,
  documentEntry,
  seededBytes,
  type TestZipEntry,
} from './zip-test-kit'
import { joinBytes } from './zip64-test-kit'

const encoder = new TextEncoder()
const DOCUMENT = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const PICTURE = seededBytes(300)
const SWATCH = encoder.encode('a small swatch of the parlor wallpaper')
const LOST = encoder.encode('an asset whose data is not in the file')
/** Bytes that do not compress: their deflated data is about as long as they are. */
const BLOB = seededBytes(16 * 1024)
const BLOB_DATA = deflateSync(BLOB)
/** Bytes that compress to about a thousandth of their length. */
const ZEROS = new Uint8Array(1024 * 1024)
const ZEROS_DATA = deflateSync(ZEROS)
const QUIET = new Uint8Array(64 * 1024)
/** fflate refuses these bytes as an invalid block. */
const GARBAGE = new Uint8Array(64).fill(0xff)
const STORED = 0
const UNKNOWN_METHOD = 12
const ENCRYPTED = 1
/** The entries beside the owner of the shared data: with it, four entries over one local entry. */
const SHARERS = 3
const MANY_SHARERS = 7
const HUGE = 2n ** 40n
const CENTRAL_COMPRESSED_AT = 20
const ALL_FIELDS = ['declaredBytes', 'compressedBytes', 'localOffset'] as const

const NOT_AN_ARCHIVE = 'not-an-archive'

afterEach(() => {
  vi.restoreAllMocks()
})

/** `count` copies of `owner`, each under another asset name, with `overrides`. */
function sharersOf(
  owner: TestZipEntry,
  count: number,
  overrides: Partial<TestZipEntry> = {},
): TestZipEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    ...owner,
    name: assetEntryName(otherHash(index)),
    ...overrides,
  }))
}

/** The document, then an owner over `data`, then `SHARERS` asset entries over the owner's data. */
async function assetsOverOneEntry(
  content: Uint8Array,
  data: Uint8Array,
  overrides: Partial<TestZipEntry> = {},
): Promise<Uint8Array> {
  const owner = await assetEntry(content, { data, ...overrides })
  return buildSharedZip([documentEntry(DOCUMENT), owner], sharersOf(owner, SHARERS), 1)
}

/** The document over `data`, and one asset entry, named by the hash of `content`, over the same data. */
async function documentSharedByAnAsset(
  content: Uint8Array,
  data: Uint8Array,
  method?: number,
): Promise<Uint8Array> {
  const document = documentEntry(content, { data, ...(method === undefined ? {} : { method }) })
  const asset = { ...document, name: assetEntryName(await contentHashOf(content)) }
  return buildSharedZip([document], [asset], 0)
}

/**
 * The kind of a failed read, or the hashes of the assets of an ok read in their order. A test
 * compares this first, so that a failure prints a short text and not megabytes of asset bytes.
 */
function outcome(read: ArchiveRead): string | readonly string[] {
  return read.ok ? [...read.assets.keys()] : read.failure.kind
}

/** The bytes of a stored document shared by one asset that are not its data: the same for every length. */
async function shareOverhead(): Promise<number> {
  const one = seededBytes(1)
  return (await documentSharedByAnAsset(one, one, STORED)).length - one.length
}

/** The archive with the compressed size of its third entry set to the length of the file. */
function runPastTheEnd(bytes: Uint8Array): Uint8Array {
  const lostAt = centralEntryOffsets(bytes)[2] ?? Number.NaN
  return withUint32(bytes, lostAt + CENTRAL_COMPRESSED_AT, bytes.length)
}

describe('readArchive refuses entries that share more data than the archive holds', () => {
  it('refuses many deflated asset entries over one local entry', async () => {
    const bytes = await assetsOverOneEntry(BLOB, BLOB_DATA)

    expect((SHARERS + 1) * BLOB_DATA.length).toBeGreaterThan(bytes.length)
    expect(outcome(await readArchive(bytes))).toBe(NOT_AN_ARCHIVE)
  })

  it('refuses a small stream that inflates to much more, shared by entries that each declare its full size', async () => {
    const owner = await assetEntry(ZEROS, { data: ZEROS_DATA })
    const sharers = sharersOf(owner, MANY_SHARERS)
    const bytes = buildSharedZip([documentEntry(DOCUMENT), owner], sharers, 1)

    expect((MANY_SHARERS + 1) * ZEROS_DATA.length).toBeGreaterThan(bytes.length)
    expect(outcome(await readArchive(bytes))).toBe(NOT_AN_ARCHIVE)
  })

  it.each<[string, Uint8Array, Partial<TestZipEntry>]>([
    ['is shorter than it declares', BLOB_DATA, { declaredBytes: BLOB.length + 1 }],
    ['has a corrupt end', joinBytes([storedBlock(BLOB, false), GARBAGE]), {}],
    ['has an unsupported method', BLOB_DATA, { method: UNKNOWN_METHOD }],
  ])('counts a shared entry also when its data %s', async (_case, data, overrides) => {
    const bytes = await assetsOverOneEntry(BLOB, data, overrides)

    expect((SHARERS + 1) * data.length).toBeGreaterThan(bytes.length)
    expect(outcome(await readArchive(bytes))).toBe(NOT_AN_ARCHIVE)
  })

  it('refuses many stored asset entries over one local entry', async () => {
    const bytes = await assetsOverOneEntry(BLOB, BLOB, { method: STORED })

    expect((SHARERS + 1) * BLOB.length).toBeGreaterThan(bytes.length)
    expect(outcome(await readArchive(bytes))).toBe(NOT_AN_ARCHIVE)
  })

  it('refuses an asset entry over the data of a document so large that twice its data does not fit', async () => {
    const bytes = await documentSharedByAnAsset(BLOB, BLOB_DATA)

    expect(2 * BLOB_DATA.length).toBeGreaterThan(bytes.length)
    expect(outcome(await readArchive(bytes))).toBe(NOT_AN_ARCHIVE)
  })

  it('feeds the inflater no more bytes than the archive holds', async () => {
    const bytes = await assetsOverOneEntry(BLOB, BLOB_DATA)
    const pushed = recordPushedChunks()

    await readArchive(bytes)

    expect(pushed().bytes).toBeLessThanOrEqual(bytes.length)
  })
})

describe('readArchive still reads entries whose data fits the archive', () => {
  it('reads an asset entry over the data of a document so small that twice its data fits', async () => {
    const data = deflateSync(DOCUMENT)
    const bytes = await documentSharedByAnAsset(DOCUMENT, data)

    expect(2 * data.length).toBeLessThanOrEqual(bytes.length)
    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [await hashed(DOCUMENT)],
      rejectedAssets: [],
    })
  })

  it.each<[string, (bytes: Uint8Array) => Uint8Array, Partial<TestZipEntry>]>([
    [
      'a ZIP64 compressed size of 2^40',
      (bytes) => bytes,
      {
        zip64: ['compressedBytes'],
        zip64Values: { compressedBytes: HUGE },
      },
    ],
    ['a classic compressed size that runs past the end', runPastTheEnd, {}],
  ])(
    'rejects an asset whose data lies outside the file, with %s, and reads the sound assets',
    async (_case, patch, overrides) => {
      const lost = await assetEntry(LOST, overrides)
      const entries = [
        documentEntry(DOCUMENT),
        await assetEntry(PICTURE),
        lost,
        await assetEntry(SWATCH),
      ]
      const bytes = patch(buildZip(entries))

      expectRead(await readArchive(bytes), {
        document: DOCUMENT,
        assets: [await hashed(PICTURE), await hashed(SWATCH)],
        rejectedAssets: [await contentHashOf(LOST)],
      })
    },
  )

  it('rejects encrypted asset entries that share one local entry and reads the sound asset', async () => {
    const owner = await assetEntry(BLOB, { data: BLOB_DATA, flags: ENCRYPTED })
    const sound = await assetEntry(PICTURE)
    const bytes = buildSharedZip(
      [documentEntry(DOCUMENT), sound, owner],
      sharersOf(owner, SHARERS),
      2,
    )

    expect((SHARERS + 1) * BLOB_DATA.length).toBeGreaterThan(bytes.length)
    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [await hashed(PICTURE)],
      rejectedAssets: [
        await contentHashOf(BLOB),
        ...Array.from({ length: SHARERS }, (_, index) => otherHash(index)),
      ],
    })
  })

  it('reads one asset when the same asset name stands many times over one local entry', async () => {
    const owner = await assetEntry(BLOB, { data: BLOB_DATA })
    const sameName = Array.from({ length: SHARERS }, () => ({ ...owner }))
    const bytes = buildSharedZip([documentEntry(DOCUMENT), owner], sameName, 1)

    expect((SHARERS + 1) * BLOB_DATA.length).toBeGreaterThan(bytes.length)
    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [await hashed(BLOB)],
      rejectedAssets: [],
    })
  })

  it('reads the document when many entries outside the layout share one local entry', async () => {
    const [ownerName = '', ...otherNames] = NAMES_OUTSIDE_THE_LAYOUT
    const owner: TestZipEntry = { name: ownerName, content: BLOB, data: BLOB_DATA }
    const sharers = otherNames.map((name) => ({ ...owner, name }))
    const bytes = buildSharedZip([documentEntry(DOCUMENT), owner], sharers, 1)

    expect(NAMES_OUTSIDE_THE_LAYOUT.length * BLOB_DATA.length).toBeGreaterThan(bytes.length)
    expectRead(await readArchive(bytes), { document: DOCUMENT, assets: [], rejectedAssets: [] })
  })

  it('reads an honest archive with deflated, stored, and ZIP64 assets', async () => {
    const entries = [
      documentEntry(DOCUMENT),
      await assetEntry(QUIET),
      await assetEntry(PICTURE, { method: STORED }),
      await assetEntry(SWATCH, { zip64: ALL_FIELDS }),
    ]
    const bytes = buildZip(entries)

    expect(QUIET.length).toBeGreaterThan(bytes.length)
    const assets = [await hashed(QUIET), await hashed(PICTURE), await hashed(SWATCH)]
    expectRead(await readArchive(bytes), { document: DOCUMENT, assets, rejectedAssets: [] })
  })
})

describe('readArchive allows shared data up to the length of the archive', () => {
  it('reads a stored document shared by an asset when twice its data is exactly the length of the archive', async () => {
    const exact = seededBytes(await shareOverhead())
    const bytes = await documentSharedByAnAsset(exact, exact, STORED)

    expect(2 * exact.length).toBe(bytes.length)
    expectRead(await readArchive(bytes), {
      document: exact,
      assets: [await hashed(exact)],
      rejectedAssets: [],
    })
  })

  it('refuses a stored document shared by an asset when twice its data is one byte more than the archive', async () => {
    const oneMore = seededBytes((await shareOverhead()) + 1)
    const bytes = await documentSharedByAnAsset(oneMore, oneMore, STORED)

    expect(2 * oneMore.length).toBe(bytes.length + 1)
    expect(outcome(await readArchive(bytes))).toBe(NOT_AN_ARCHIVE)
  })
})
