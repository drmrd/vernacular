// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { deflateSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { assetEntryName } from './archive-layout'
import { NAMES_LIKE_AN_ASSET } from './archive-names-test-kit'
import { readArchive, type ArchiveRead } from './read-archive'
import {
  ASSET_FAULTS,
  buildSharedZip,
  buildZipWithFaults,
  CORRUPT_STREAM,
  ENCRYPTED_ENTRY,
  expectRead,
  LOCAL_HEADER_PAST_THE_END,
  misnamedAssetEntry,
  readLists,
  type AssetFault,
  type EntryWithFault,
  type HashedAsset,
} from './zip-edges-test-kit'
import {
  assetEntry,
  buildZip,
  contentHashOf,
  documentEntry,
  seededBytes,
  type TestZipEntry,
} from './zip-test-kit'

const encoder = new TextEncoder()
const DOCUMENT = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const DOCUMENT_DATA = deflateSync(DOCUMENT)
const PICTURE = seededBytes(300)
const SWATCH = encoder.encode('a small swatch of the parlor wallpaper')
const RAIL = encoder.encode('the profile of the picture rail')
const STRAY = encoder.encode('bytes that belong to no name of the archive')
const NEWEL = encoder.encode('a carved newel post')
const FRIEZE = encoder.encode('a stencilled frieze')
const LINTEL = encoder.encode('a stone lintel')
const CORBEL = encoder.encode('a bracket under the eaves')
const BALUSTER = encoder.encode('a turned baluster')
/** Bytes that do not compress: their deflated data is about as long as they are. */
const BLOB = seededBytes(16 * 1024)
const BLOB_DATA = deflateSync(BLOB)
const STORED = 0
const SHORT_DECLARED_BYTES = 10
const SHARERS = 3
const BYTES_BEFORE_THE_ARCHIVE = 37
const BYTES_AFTER_THE_ARCHIVE = 53
const HEX_RADIX = 16
const HASH_DIGITS = 64

async function hashed(bytes: Uint8Array): Promise<HashedAsset> {
  return [await contentHashOf(bytes), bytes]
}

/** The archive copied into a larger buffer of other bytes, as a view at a non-zero offset. */
function inLargerBuffer(bytes: Uint8Array): Uint8Array {
  const total = BYTES_BEFORE_THE_ARCHIVE + bytes.length + BYTES_AFTER_THE_ARCHIVE
  const view = new Uint8Array(seededBytes(total).buffer, BYTES_BEFORE_THE_ARCHIVE, bytes.length)
  view.set(bytes)
  return view
}

/** One asset entry of the mixed archive: its content, the bytes its name is the hash of, and its fault. */
interface MixedEntry {
  readonly content: Uint8Array
  readonly namedFor?: Uint8Array
  readonly fault?: AssetFault
}

/** Where the document stands among the entries of the mixed archive. */
const MIXED_DOCUMENT_AT = 3

/** Sound assets, misnamed ones, and faulty ones, then a duplicate name of each kind. */
const MIXED: readonly MixedEntry[] = [
  { content: STRAY, namedFor: NEWEL },
  { content: PICTURE },
  { content: FRIEZE, fault: CORRUPT_STREAM },
  { content: SWATCH },
  { content: LINTEL, fault: ENCRYPTED_ENTRY },
  { content: STRAY, namedFor: CORBEL },
  { content: BALUSTER, fault: LOCAL_HEADER_PAST_THE_END },
  { content: RAIL },
  { content: STRAY, namedFor: PICTURE },
  { content: NEWEL },
  { content: FRIEZE },
  { content: SWATCH, fault: CORRUPT_STREAM },
  { content: CORBEL, fault: ENCRYPTED_ENTRY },
  { content: BALUSTER },
]
const MIXED_ACCEPTED = [PICTURE, SWATCH, RAIL]
const MIXED_REJECTED = [NEWEL, FRIEZE, LINTEL, CORBEL, BALUSTER]

async function mixedEntry({ content, namedFor, fault }: MixedEntry): Promise<EntryWithFault> {
  return [await misnamedAssetEntry(content, namedFor ?? content), fault]
}

async function mixedArchive(): Promise<Uint8Array> {
  const entries = await Promise.all(MIXED.map(mixedEntry))
  entries.splice(MIXED_DOCUMENT_AT, 0, [documentEntry(DOCUMENT), undefined])
  return buildZipWithFaults(entries)
}

function bothLists(read: ArchiveRead): readonly [readonly string[], readonly string[]] {
  return read.ok ? [[...read.assets.keys()], read.rejectedAssets] : [[], []]
}

/** The hexadecimal digits of a hash that names no bytes of these tests. */
function otherHash(index: number): string {
  return (index + 1).toString(HEX_RADIX).padStart(HASH_DIGITS, '0')
}

describe('readArchive hashes the bytes of an asset and not the buffer around them', () => {
  it.each<[string, Partial<TestZipEntry>]>([
    ['stored', { method: STORED }],
    ['deflated', {}],
  ])(
    'reads a %s asset of an archive that is a view at an offset of a larger buffer',
    async (_case, overrides) => {
      const archive = buildZip([documentEntry(DOCUMENT), await assetEntry(PICTURE, overrides)])
      const view = inLargerBuffer(archive)

      expect(view.byteOffset).toBeGreaterThan(0)
      expect(view.buffer.byteLength).toBeGreaterThan(view.length)
      expectRead(await readArchive(view), {
        document: DOCUMENT,
        assets: [await hashed(PICTURE)],
        rejectedAssets: [],
      })
    },
  )
})

describe('readArchive rejects a name whose first entry fails, once', () => {
  it.each(ASSET_FAULTS)(
    'a first entry with %s is rejected once, and a sound entry of its name after it does not stand in',
    async (_case, fault) => {
      const bytes = buildZipWithFaults([
        [documentEntry(DOCUMENT), undefined],
        [await assetEntry(PICTURE), fault],
        [await assetEntry(PICTURE), undefined],
      ])

      expectRead(await readArchive(bytes), {
        document: DOCUMENT,
        assets: [],
        rejectedAssets: [await contentHashOf(PICTURE)],
      })
    },
  )

  it('a first entry with wrong bytes is rejected once, and one with the right bytes after it does not stand in', async () => {
    const entries = [
      documentEntry(DOCUMENT),
      await misnamedAssetEntry(SWATCH, PICTURE),
      await assetEntry(PICTURE),
    ]

    expectRead(await readArchive(buildZip(entries)), {
      document: DOCUMENT,
      assets: [],
      rejectedAssets: [await contentHashOf(PICTURE)],
    })
  })
})

describe('readArchive keeps both lists apart and in the order of the central directory', () => {
  it('never puts a hash in both lists or twice in one, and puts each asset name in one list', async () => {
    const [accepted, rejected] = bothLists(await readArchive(await mixedArchive()))
    const names = await Promise.all([...MIXED_ACCEPTED, ...MIXED_REJECTED].map(contentHashOf))

    expect(new Set(accepted).size).toBe(accepted.length)
    expect(new Set(rejected).size).toBe(rejected.length)
    expect(accepted.filter((hash) => rejected.includes(hash))).toEqual([])
    expect([...accepted, ...rejected].sort()).toEqual(names.sort())
  })

  it('lists faults and mismatches among sound assets in the order of the central directory', async () => {
    const rejected = await Promise.all(MIXED_REJECTED.map(contentHashOf))

    expect([...rejected].sort()).not.toEqual(rejected)
    expectRead(await readArchive(await mixedArchive()), {
      document: DOCUMENT,
      assets: await Promise.all(MIXED_ACCEPTED.map(hashed)),
      rejectedAssets: rejected,
    })
  })
})

describe('readArchive rejects only the assets of the layout that it reads', () => {
  it.each(NAMES_LIKE_AN_ASSET)(
    'a faulty entry whose name only looks like an asset name (%s) is in neither list',
    async (_case, nameOf) => {
      const name = nameOf(await contentHashOf(PICTURE))
      const bytes = buildZipWithFaults([
        [documentEntry(DOCUMENT), undefined],
        [{ name, content: PICTURE }, CORRUPT_STREAM],
        [await assetEntry(SWATCH), undefined],
      ])

      expectRead(await readArchive(bytes), {
        document: DOCUMENT,
        assets: [await hashed(SWATCH)],
        rejectedAssets: [],
      })
    },
  )

  it('a later entry of a name that was read is in neither list, with wrong bytes or a fault', async () => {
    const first = await assetEntry(PICTURE)
    const bytes = buildZipWithFaults([
      [documentEntry(DOCUMENT), undefined],
      [first, undefined],
      [{ ...first, content: SWATCH }, undefined],
      [first, CORRUPT_STREAM],
    ])

    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [await hashed(PICTURE)],
      rejectedAssets: [],
    })
  })

  it.each<[string, Partial<TestZipEntry>]>([
    ['deflated', {}],
    ['stored', { method: STORED }],
  ])(
    'an asset that passes its declared size refuses the archive and is not rejected (%s)',
    async (_case, overrides) => {
      const liar = await assetEntry(PICTURE, { declaredBytes: SHORT_DECLARED_BYTES, ...overrides })
      const misnamed = await misnamedAssetEntry(SWATCH, RAIL)
      const bytes = buildZip([documentEntry(DOCUMENT), misnamed, liar])

      expect(readLists(await readArchive(bytes))).toBe('not-an-archive')
    },
  )

  it('asset entries that share more data than the archive holds refuse it and are not rejected', async () => {
    const owner = await assetEntry(BLOB, { data: BLOB_DATA })
    const sharers = Array.from({ length: SHARERS }, (_, index) => ({
      ...owner,
      name: assetEntryName(otherHash(index)),
    }))
    const document = documentEntry(DOCUMENT, { data: DOCUMENT_DATA })
    const bytes = buildSharedZip([document, owner], sharers, 1)

    expect((SHARERS + 1) * BLOB_DATA.length).toBeGreaterThan(bytes.length)
    expect(readLists(await readArchive(bytes))).toBe('not-an-archive')
  })
})
