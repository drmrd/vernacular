// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { deflateSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assetEntryName } from './archive-layout'
import { readArchive, type ArchiveRead } from './read-archive'
import { otherHash } from './read-archive-test-kit'
import {
  buildSharedZip,
  buildZip64SharedZip,
  centralEntryOffsets,
  expectRead,
  localOffsetOfEntry,
  recordPushedChunks,
  withUint32,
} from './zip-edges-test-kit'
import {
  assetEntry,
  contentHashOf,
  documentEntry,
  seededBytes,
  type TestZipEntry,
} from './zip-test-kit'

const encoder = new TextEncoder()
const DOCUMENT = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const DOCUMENT_DATA = deflateSync(DOCUMENT)
const PICTURE = seededBytes(300)
/** Bytes that do not compress: their deflated data is about as long as they are. */
const BLOB = seededBytes(16 * 1024)
const BLOB_DATA = deflateSync(BLOB)
const VIEWED = seededBytes(40_000)
const SHORTER_VIEWS = [20_000, 10_000]
const EMPTY = new Uint8Array(0)
const STORED = 0
const ENCRYPTED = 1
const SHARERS = 3
const DOCUMENT_SHARERS = 4
/** With the owner and the document, the default entry limit of 10,000. */
const MANY_SHARERS = 9_998
const MANY_ENTRIES_TIMEOUT_MS = 120_000
const LOCAL_HEADER_BYTES = 30
const LOCAL_SIGNATURE = 0x04034b50
const LOCAL_NAME_LENGTH_AT = 26
const CENTRAL_COMPRESSED_AT = 20
const CENTRAL_LOCAL_OFFSET_AT = 42

afterEach(() => {
  vi.restoreAllMocks()
})

/** `count` copies of `owner`, each under the asset name of `otherHash`. */
function sharersOf(owner: TestZipEntry, count: number): TestZipEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    ...owner,
    name: assetEntryName(otherHash(index)),
  }))
}

/** The kind of a failed read, or the hashes of the assets of an ok read in their order. */
function outcome(read: ArchiveRead): string | readonly string[] {
  return read.ok ? [...read.assets.keys()] : read.failure.kind
}

function sharedDocument(): TestZipEntry {
  return documentEntry(DOCUMENT, { data: DOCUMENT_DATA })
}

/** The document, an owner of `MANY_SHARERS` sharers, and the sharers, each a copy of the owner. */
async function manySharers(
  content: Uint8Array,
  overrides: Partial<TestZipEntry>,
): Promise<Uint8Array> {
  const owner = await assetEntry(content, overrides)
  return buildSharedZip([sharedDocument(), owner], sharersOf(owner, MANY_SHARERS), 1)
}

/** A copy of the archive in which every entry after the first gives a compressed size of the length of the file. */
function withDataPastTheEnd(bytes: Uint8Array): Uint8Array {
  const copy = bytes.slice()
  const view = new DataView(copy.buffer)
  for (const entryAt of centralEntryOffsets(copy).slice(1)) {
    view.setUint32(entryAt + CENTRAL_COMPRESSED_AT, copy.length, true)
  }
  return copy
}

/**
 * An outer stored asset whose bytes are the local entry of an inner stored asset, and a
 * central directory entry for the inner asset that points into the data of the outer one.
 */
async function assetInsideAnother(
  inner: Uint8Array,
): Promise<{ readonly bytes: Uint8Array; readonly outer: Uint8Array }> {
  const innerEntry = await assetEntry(inner, { method: STORED })
  const innerName = encoder.encode(innerEntry.name)
  const innerLocal = new Uint8Array(LOCAL_HEADER_BYTES + innerName.length + inner.length)
  const view = new DataView(innerLocal.buffer)
  view.setUint32(0, LOCAL_SIGNATURE, true)
  view.setUint16(LOCAL_NAME_LENGTH_AT, innerName.length, true)
  innerLocal.set(innerName, LOCAL_HEADER_BYTES)
  innerLocal.set(inner, LOCAL_HEADER_BYTES + innerName.length)
  const outer = await assetEntry(innerLocal, { method: STORED })
  const bytes = buildSharedZip([outer, sharedDocument()], [innerEntry], 0)
  const outerDataAt =
    localOffsetOfEntry(bytes, 0) + LOCAL_HEADER_BYTES + encoder.encode(outer.name).length
  const innerAt = centralEntryOffsets(bytes)[2] ?? Number.NaN
  return {
    bytes: withUint32(bytes, innerAt + CENTRAL_LOCAL_OFFSET_AT, outerDataAt),
    outer: innerLocal,
  }
}

describe('readArchive bounds shared data at its edges', () => {
  it(
    'of 9,999 empty assets over one local entry reads the one named by the hash of no bytes and rejects the others, and rejects all when each declares one byte',
    async () => {
      const declaringNothing = await manySharers(EMPTY, { method: STORED })
      const declaringOne = await manySharers(EMPTY, { method: STORED, declaredBytes: 1 })
      const emptyHash = await contentHashOf(EMPTY)
      const otherNames = Array.from({ length: MANY_SHARERS }, (_, index) => otherHash(index))

      expectRead(await readArchive(declaringNothing), {
        document: DOCUMENT,
        assets: [[emptyHash, EMPTY]],
        rejectedAssets: otherNames,
      })
      expectRead(await readArchive(declaringOne), {
        document: DOCUMENT,
        assets: [],
        rejectedAssets: [emptyHash, ...otherNames],
      })
    },
    MANY_ENTRIES_TIMEOUT_MS,
  )

  it('refuses views of different lengths of one stored local entry', async () => {
    const owner = await assetEntry(VIEWED, { method: STORED })
    const views = await Promise.all(
      SHORTER_VIEWS.map((length) => assetEntry(VIEWED.subarray(0, length), { method: STORED })),
    )
    const bytes = buildSharedZip([sharedDocument(), owner], views, 1)

    const viewed = VIEWED.length + SHORTER_VIEWS.reduce((sum, length) => sum + length, 0)
    expect(viewed).toBeGreaterThan(bytes.length)
    expect(outcome(await readArchive(bytes))).toBe('not-an-archive')
  })

  it('refuses an asset whose local header lies inside the stored data of another asset', async () => {
    const { bytes } = await assetInsideAnother(BLOB)

    expect(2 * BLOB.length).toBeGreaterThan(bytes.length)
    expect(outcome(await readArchive(bytes))).toBe('not-an-archive')
  })

  it('refuses sharers that give the local offset of their owner in a ZIP64 block', async () => {
    const owner = await assetEntry(BLOB, { data: BLOB_DATA })
    const bytes = buildZip64SharedZip([sharedDocument(), owner], sharersOf(owner, SHARERS), 1)

    expect((SHARERS + 1) * BLOB_DATA.length).toBeGreaterThan(bytes.length)
    expect(outcome(await readArchive(bytes))).toBe('not-an-archive')
  })
})

describe('readArchive reads around shared data that it does not take', () => {
  it('rejects an encrypted first entry of a name that shares its data with a sound one, and reads no asset', async () => {
    const owner = await assetEntry(PICTURE, { flags: ENCRYPTED })
    const bytes = buildSharedZip([sharedDocument(), owner], [{ ...owner, flags: 0 }], 1)
    const pushed = recordPushedChunks()

    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [],
      rejectedAssets: [await contentHashOf(PICTURE)],
    })
    expect(pushed().bytes).toBeLessThanOrEqual(DOCUMENT_DATA.length)
  })

  it.each<[string, Partial<TestZipEntry>, (bytes: Uint8Array) => Uint8Array]>([
    ['are encrypted', { flags: ENCRYPTED }, (bytes) => bytes],
    ['have data that runs past the end of the file', {}, withDataPastTheEnd],
  ])(
    'inflates only the document and rejects every name when 9,999 asset entries over one local entry %s',
    async (_case, overrides, patch) => {
      const bytes = patch(await manySharers(PICTURE, overrides))
      const names = [
        await contentHashOf(PICTURE),
        ...Array.from({ length: MANY_SHARERS }, (_, index) => otherHash(index)),
      ]
      const pushed = recordPushedChunks()

      expectRead(await readArchive(bytes), {
        document: DOCUMENT,
        assets: [],
        rejectedAssets: names,
      })
      expect(pushed().calls).toBe(1)
    },
    MANY_ENTRIES_TIMEOUT_MS,
  )

  it('inflates four asset entries over the data of the document when five times that data fits, and keeps the one named by its hash', async () => {
    const documentHash = await contentHashOf(DOCUMENT)
    const sharers = [
      { ...sharedDocument(), name: assetEntryName(documentHash) },
      ...sharersOf(sharedDocument(), DOCUMENT_SHARERS - 1),
    ]
    const bytes = buildSharedZip([sharedDocument()], sharers, 0)
    const pushed = recordPushedChunks()

    expect((DOCUMENT_SHARERS + 1) * DOCUMENT_DATA.length).toBeLessThanOrEqual(bytes.length)
    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [[documentHash, DOCUMENT]],
      rejectedAssets: Array.from({ length: DOCUMENT_SHARERS - 1 }, (_, index) => otherHash(index)),
    })
    // The document and each of the four sharers go to the inflater, one push each.
    expect(pushed().calls).toBe(DOCUMENT_SHARERS + 1)
  })
})

describe('readArchive reads the same shapes when their shared data fits', () => {
  it('reads an asset whose local header lies inside the stored data of another, when both fit', async () => {
    const { bytes, outer } = await assetInsideAnother(PICTURE)

    const read = await readArchive(bytes)
    expect(outcome(read)).toEqual([await contentHashOf(outer), await contentHashOf(PICTURE)])
    expect(read.ok && read.assets.get(await contentHashOf(PICTURE))).toEqual(PICTURE)
  })

  it('reads a sharer that gives the local offset of its owner in a ZIP64 block, when both fit', async () => {
    // The owner's name is no hash of its bytes, so only the sharer's bytes can be kept.
    const sharer = await assetEntry(PICTURE)
    const owner = { ...sharer, name: assetEntryName(otherHash(0)) }
    const bytes = buildZip64SharedZip([sharedDocument(), owner], [sharer], 1)

    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [[await contentHashOf(PICTURE), PICTURE]],
      rejectedAssets: [otherHash(0)],
    })
  })
})
