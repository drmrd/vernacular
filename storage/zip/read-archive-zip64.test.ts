// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { ARCHIVE_LIMITS, type ArchiveLimitName, type ArchiveLimits } from './archive-limits'
import { readArchive, type ArchiveRead } from './read-archive'
import { buildZip, documentEntry, type TestZipEntry } from './zip-test-kit'
import {
  forcedZip64Archive,
  streamedZip64Archive,
  type TestZip64End,
  type Zip64EndField,
  type Zip64EntryField,
} from './zip64-test-kit'

const encoder = new TextEncoder()
const DOCUMENT = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const NOTES: TestZipEntry = { name: 'notes.txt', content: encoder.encode('a note beside it') }
/** fflate refuses these bytes as an invalid block. */
const GARBAGE = new Uint8Array(64).fill(0xff)
const ALL_ENTRY_FIELDS: readonly Zip64EntryField[] = [
  'declaredBytes',
  'compressedBytes',
  'localOffset',
]
const BOTH_COUNTS: readonly Zip64EndField[] = ['entriesOnDisk', 'entries']
/** The sound archive of one document. */
const SOUND: readonly TestZipEntry[] = [documentEntry(DOCUMENT)]
/** With `zip64End: {}`, every field of the end record and of the entry holds its marker. */
const FORCED: readonly TestZipEntry[] = [documentEntry(DOCUMENT, { zip64: ALL_ENTRY_FIELDS })]
const FORCED_LENGTH = buildZip(FORCED, { zip64End: {} }).length
/** The end record (22), the locator (20), and the ZIP64 end record (56) stand last. */
const TRUE_RECORD_OFFSET = FORCED_LENGTH - 98
/** The length of the sound archive with ZIP64 records and no marker. */
const UNMARKED_LENGTH = buildZip(SOUND, { zip64End: { markers: [] } }).length
const STREAMED_LENGTH = streamedZip64Archive().length
const END_RECORD_BYTES = 22
const HUGE = 2n ** 60n

type Zip64EndValues = NonNullable<TestZip64End['values']>

const NOT_AN_ARCHIVE: ArchiveRead = { ok: false, failure: { kind: 'not-an-archive' } }
const NO_DOCUMENT: ArchiveRead = { ok: false, failure: { kind: 'no-document' } }
const DOCUMENT_READ: ArchiveRead = {
  ok: true,
  document: DOCUMENT,
  assets: new Map(),
  rejectedAssets: [],
}

function tooLarge(limit: ArchiveLimitName, allowed: number): ArchiveRead {
  return { ok: false, failure: { kind: 'too-large', limit, allowed } }
}

function limitsWith(overrides: Partial<ArchiveLimits>): ArchiveLimits {
  return { ...ARCHIVE_LIMITS, ...overrides }
}

function readWithEnd(zip64End: TestZip64End, entries: readonly TestZipEntry[] = SOUND) {
  return readArchive(buildZip(entries, { zip64End }))
}

/** A classic archive of the sound document with one end record field of 2 bytes set. */
function soundWithEndField(offset: number, value: number): Uint8Array {
  const bytes = buildZip(SOUND)
  new DataView(bytes.buffer).setUint16(bytes.length - END_RECORD_BYTES + offset, value, true)
  return bytes
}

function patched(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  new DataView(bytes.buffer).setUint32(offset, value, true)
  return bytes
}

describe('readArchive reads the ZIP64 records of an end record', () => {
  it('reads the forced ZIP64 archive that a common command-line archiver wrote', async () => {
    expect(await readArchive(forcedZip64Archive())).toEqual({
      ...DOCUMENT_READ,
      document: encoder.encode('{"x":1}'),
    })
  })

  it.each<[string, Uint8Array]>([
    ['as written', streamedZip64Archive()],
    ['with no ZIP64 end record signature', patched(streamedZip64Archive(), 109, 0)],
    [
      'with a locator that points past the file',
      patched(streamedZip64Archive(), 173, STREAMED_LENGTH),
    ],
  ])('reads the streamed archive by its classic values: %s', async (_case, bytes) => {
    expect(await readArchive(bytes)).toEqual(NO_DOCUMENT)
  })

  it('reads an archive with a marker in both counts, the size, and the offset', async () => {
    expect(await readWithEnd({}, FORCED)).toEqual(DOCUMENT_READ)
  })

  it.each<Zip64EndField>(['entriesOnDisk', 'entries', 'directoryBytes', 'directoryOffset'])(
    'reads an archive with a marker in one field of the end record only: %s',
    async (field) => {
      expect(await readWithEnd({ markers: [field] })).toEqual(DOCUMENT_READ)
    },
  )

  it('a classic value wins over the ZIP64 end record where no marker stands', async () => {
    const values = { entriesOnDisk: 99, entries: 99, directoryBytes: 1 }

    expect(await readWithEnd({ markers: ['directoryOffset'], values })).toEqual(DOCUMENT_READ)
  })

  it.each<[string, TestZip64End]>([
    ['other values in the record', { values: { entries: 99, directoryOffset: 12_345 } }],
    ['recordSignature 0', { recordSignature: 0 }],
    ['a locatorOffset of the length of the file', { locatorOffset: UNMARKED_LENGTH }],
    ['locatorDisk 1', { locatorDisk: 1 }],
    ['totalDisks 5', { totalDisks: 5 }],
  ])('ZIP64 records beside classic values are not read: %s', async (_case, end) => {
    expect(await readWithEnd({ ...end, markers: [] })).toEqual(DOCUMENT_READ)
  })

  it("the ZIP64 end record's own size field is not read", async () => {
    expect(await readWithEnd({ recordSize: 0 }, FORCED)).toEqual(DOCUMENT_READ)
    expect(await readWithEnd({ recordSize: HUGE }, FORCED)).toEqual(DOCUMENT_READ)
  })

  it('a locator on another disk, or with more than one disk in total, is not an archive, and a total of 0 reads', async () => {
    expect(await readWithEnd({ locatorDisk: 1 })).toEqual(NOT_AN_ARCHIVE)
    expect(await readWithEnd({ totalDisks: 2 })).toEqual(NOT_AN_ARCHIVE)
    expect(await readWithEnd({ totalDisks: 0 })).toEqual(DOCUMENT_READ)
  })
})

describe('readArchive takes the count of entries from the ZIP64 end record', () => {
  it('a count above the limit that only the ZIP64 end record gives is refused before an entry is read', async () => {
    const entries = [documentEntry(DOCUMENT, { data: GARBAGE }), { ...NOTES, data: GARBAGE }]
    const markers: Zip64EndField[] = [...BOTH_COUNTS, 'directoryOffset']
    const counting = (count: number) => ({
      markers,
      values: { entriesOnDisk: count, entries: count, directoryOffset: 1_000_000 },
    })
    const limits = limitsWith({ entries: 3 })

    expect(await readArchive(buildZip(entries, { zip64End: counting(4) }), limits)).toEqual(
      tooLarge('entries', 3),
    )
    expect(await readArchive(buildZip(entries, { zip64End: counting(3) }), limits)).toEqual(
      NOT_AN_ARCHIVE,
    )
  })

  it('a ZIP64 count of 2^60 is too many entries', async () => {
    const zip64End = { markers: BOTH_COUNTS, values: { entriesOnDisk: HUGE, entries: HUGE } }

    expect(await readWithEnd(zip64End)).toEqual(tooLarge('entries', 10_000))
  })

  it('a count marker with no locator is the count 65,535', async () => {
    const endRecordOnly = buildZip([], { declaredEntries: 0xffff })
    const noLocator = { markers: BOTH_COUNTS, locatorSignature: 0 }

    expect(await readArchive(endRecordOnly)).toEqual(tooLarge('entries', 10_000))
    expect(await readArchive(endRecordOnly, limitsWith({ entries: 70_000 }))).toEqual(
      NOT_AN_ARCHIVE,
    )
    expect(await readWithEnd(noLocator)).toEqual(tooLarge('entries', 10_000))
  })

  it.each<Zip64EndField>(['directoryBytes', 'directoryOffset'])(
    'a size marker or an offset marker with no locator is not an archive: %s',
    async (field) => {
      expect(await readWithEnd({ markers: [field], locatorSignature: 0 })).toEqual(NOT_AN_ARCHIVE)
    },
  )
})

describe('readArchive refuses ZIP64 end records it cannot trust', () => {
  it('a ZIP64 end record with a wrong signature is not an archive', async () => {
    expect(await readWithEnd({ recordSignature: 0 })).toEqual(NOT_AN_ARCHIVE)
  })

  it.each<[string, bigint | number]>([
    ['the length of the file plus 100', FORCED_LENGTH + 100],
    ['the true offset plus 1', TRUE_RECORD_OFFSET + 1],
    ['2^60', HUGE],
  ])(
    'a locator whose offset does not leave the ZIP64 end record whole before the locator is not an archive: %s',
    async (_case, locatorOffset) => {
      expect(await readWithEnd({ locatorOffset }, FORCED)).toEqual(NOT_AN_ARCHIVE)
    },
  )

  it('a disk number other than 0 is not an archive, as a classic value and as a ZIP64 value', async () => {
    const disks: Zip64EndField[] = ['disk', 'directoryDisk']

    expect(await readArchive(soundWithEndField(4, 1))).toEqual(NOT_AN_ARCHIVE)
    expect(await readArchive(soundWithEndField(6, 1))).toEqual(NOT_AN_ARCHIVE)
    expect(await readWithEnd({ markers: disks })).toEqual(DOCUMENT_READ)
    expect(await readWithEnd({ markers: disks, values: { disk: 3 } })).toEqual(NOT_AN_ARCHIVE)
    expect(await readWithEnd({ markers: disks, values: { directoryDisk: 3 } })).toEqual(
      NOT_AN_ARCHIVE,
    )
    expect(await readWithEnd({ markers: disks, locatorSignature: 0 })).toEqual(NOT_AN_ARCHIVE)
  })

  it('a count on this disk other than the count is not an archive, as classic values and as ZIP64 values', async () => {
    expect(await readArchive(soundWithEndField(8, 0))).toEqual(NOT_AN_ARCHIVE)
    expect(await readWithEnd({ markers: BOTH_COUNTS, values: { entriesOnDisk: 0 } })).toEqual(
      NOT_AN_ARCHIVE,
    )
  })

  it.each<[string, (directory: { bytes: number; offset: number }) => Zip64EndValues]>([
    ['the true offset plus 1', ({ offset }) => ({ directoryOffset: offset + 1 })],
    ['the true size plus 1', ({ bytes }) => ({ directoryBytes: bytes + 1 })],
    ['an offset of 2^60', () => ({ directoryOffset: HUGE })],
    ['a size of 2^60', () => ({ directoryBytes: HUGE })],
  ])(
    'a ZIP64 size or offset of the central directory that passes the ZIP64 end record is not an archive: %s',
    async (_case, fault) => {
      const classic = buildZip(FORCED)
      const view = new DataView(classic.buffer)
      const bytes = view.getUint32(classic.length - END_RECORD_BYTES + 12, true)
      const offset = view.getUint32(classic.length - END_RECORD_BYTES + 16, true)

      const values = fault({ bytes, offset })

      expect(await readWithEnd({ values }, FORCED)).toEqual(NOT_AN_ARCHIVE)
    },
  )

  it('every prefix of a forced ZIP64 archive resolves, and none is read as ok', async () => {
    const bytes = buildZip(FORCED, { zip64End: {} })
    const prefixes = Array.from({ length: bytes.length }, (_, length) => bytes.slice(0, length))

    const reads: ArchiveRead[] = await Promise.all(prefixes.map((prefix) => readArchive(prefix)))

    expect(reads.filter((read) => read.ok)).toEqual([])
  })
})
