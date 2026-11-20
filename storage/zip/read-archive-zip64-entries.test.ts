// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { ARCHIVE_LIMITS, type ArchiveLimits } from './archive-limits'
import { readArchive, type ArchiveRead } from './read-archive'
import { limitsWith, tooLarge } from './read-archive-test-kit'
import { buildZip, documentEntry, type TestZipEntry } from './zip-test-kit'
import {
  extraBlock,
  joinBytes,
  wideBytes,
  ZIP64_BLOCK_ID,
  type Zip64EntryField,
} from './zip64-test-kit'

const encoder = new TextEncoder()
const DOCUMENT = encoder.encode(
  JSON.stringify({ meta: { name: 'Elm Street' }, floors: ['parlor', 'hall', 'kitchen'] }),
)
/** A stored document that stands first: its three true values are the length, the length, and 0. */
const LENGTH = DOCUMENT.length
const SOUND_VALUES = wideBytes([LENGTH, LENGTH, 0])
const NOTES: TestZipEntry = { name: 'notes.txt', content: encoder.encode('a note beside it') }
/** fflate refuses these bytes as an invalid block. */
const GARBAGE = new Uint8Array(64).fill(0xff)
const ALL_FIELDS: readonly Zip64EntryField[] = ['declaredBytes', 'compressedBytes', 'localOffset']
const SIZES: readonly Zip64EntryField[] = ['declaredBytes', 'compressedBytes']
const HUGE = 2n ** 60n
const OTHER_BLOCK_ID = 0x5455

const NOT_AN_ARCHIVE: ArchiveRead = { ok: false, failure: { kind: 'not-an-archive' } }
const DOCUMENT_READ: ArchiveRead = {
  ok: true,
  document: DOCUMENT,
  assets: new Map(),
  rejectedAssets: [],
}

function storedDocument(overrides: Partial<TestZipEntry>): TestZipEntry {
  return documentEntry(DOCUMENT, { method: 0, ...overrides })
}

function read(entries: readonly TestZipEntry[], limits?: ArchiveLimits) {
  return readArchive(buildZip(entries), limits)
}

describe('readArchive reads the ZIP64 block of a central directory entry', () => {
  it('reads a document whose three fields hold the marker', async () => {
    expect(await read([NOTES, documentEntry(DOCUMENT, { zip64: ALL_FIELDS })])).toEqual(
      DOCUMENT_READ,
    )
  })

  it.each<{ readonly zip64: readonly Zip64EntryField[] }>([
    { zip64: ['declaredBytes'] },
    { zip64: ['compressedBytes'] },
    { zip64: ['localOffset'] },
    { zip64: ['declaredBytes', 'compressedBytes'] },
    { zip64: ['declaredBytes', 'localOffset'] },
    { zip64: ['compressedBytes', 'localOffset'] },
  ])('takes the values in the fixed order for every set of markers: $zip64', async ({ zip64 }) => {
    expect(await read([NOTES, documentEntry(DOCUMENT, { zip64 })])).toEqual(DOCUMENT_READ)
  })

  it('a ZIP64 block beside classic values is not read', async () => {
    const centralExtra = extraBlock(ZIP64_BLOCK_ID, wideBytes([999, 999, 999]))

    expect(await read([documentEntry(DOCUMENT, { centralExtra })])).toEqual(DOCUMENT_READ)
  })

  it('passes over other blocks before the ZIP64 block', async () => {
    const centralExtra = joinBytes([
      extraBlock(OTHER_BLOCK_ID, new Uint8Array(5)),
      extraBlock(0x000a, new Uint8Array(0)),
      extraBlock(ZIP64_BLOCK_ID, SOUND_VALUES),
    ])

    expect(await read([storedDocument({ zip64: ALL_FIELDS, centralExtra })])).toEqual(DOCUMENT_READ)
  })

  it('of two ZIP64 blocks the first is read', async () => {
    const sound = extraBlock(ZIP64_BLOCK_ID, SOUND_VALUES)
    const other = extraBlock(ZIP64_BLOCK_ID, wideBytes([1, 2, 3]))
    const tooLong = extraBlock(ZIP64_BLOCK_ID, wideBytes([LENGTH + 1, LENGTH, 0]))
    const withExtra = (centralExtra: Uint8Array) => [
      storedDocument({ zip64: ALL_FIELDS, centralExtra }),
    ]

    expect(await read(withExtra(joinBytes([sound, other])))).toEqual(DOCUMENT_READ)
    expect(await read(withExtra(joinBytes([tooLong, sound])))).toEqual(NOT_AN_ARCHIVE)
  })

  it('reads a document whose local header is in the ZIP64 form', async () => {
    const localExtra = extraBlock(ZIP64_BLOCK_ID, wideBytes([LENGTH, LENGTH]))

    expect(await read([storedDocument({ localDeclaredBytes: 0xffffffff, localExtra })])).toEqual(
      DOCUMENT_READ,
    )
  })

  it('reads a document whose entry holds the marker in its disk number, with a ZIP64 disk number of 0 after the three values', async () => {
    const centralExtra = extraBlock(ZIP64_BLOCK_ID, joinBytes([SOUND_VALUES, new Uint8Array(4)]))

    expect(
      await read([storedDocument({ zip64: ALL_FIELDS, diskStart: 0xffff, centralExtra })]),
    ).toEqual(DOCUMENT_READ)
  })
})

describe('readArchive refuses a ZIP64 block it cannot trust', () => {
  it.each<[string, readonly TestZipEntry[]]>([
    [
      'no data for one marker',
      [
        storedDocument({
          zip64: ['declaredBytes'],
          centralExtra: extraBlock(ZIP64_BLOCK_ID, new Uint8Array(0)),
        }),
      ],
    ],
    [
      '7 bytes for one marker',
      [
        storedDocument({
          zip64: ['declaredBytes'],
          centralExtra: extraBlock(ZIP64_BLOCK_ID, wideBytes([LENGTH]).slice(0, 7)),
        }),
      ],
    ],
    [
      '8 bytes for two markers',
      [
        storedDocument({
          zip64: SIZES,
          centralExtra: extraBlock(ZIP64_BLOCK_ID, wideBytes([LENGTH])),
        }),
      ],
    ],
    [
      '16 bytes for three markers',
      [
        storedDocument({
          zip64: ALL_FIELDS,
          centralExtra: extraBlock(ZIP64_BLOCK_ID, wideBytes([LENGTH, LENGTH])),
        }),
      ],
    ],
    [
      '8 bytes for two markers on an entry notes.txt beside a sound document',
      [
        storedDocument({}),
        {
          ...NOTES,
          zip64: SIZES,
          centralExtra: extraBlock(ZIP64_BLOCK_ID, wideBytes([NOTES.content.length])),
        },
      ],
    ],
  ])('a block shorter than its markers need is not an archive: %s', async (_case, entries) => {
    expect(await read(entries)).toEqual(NOT_AN_ARCHIVE)
  })

  it('a marker with no block is the number that it holds', async () => {
    const noBlock = new Uint8Array(0)
    const markedDocument = (field: Zip64EntryField) =>
      storedDocument({ zip64: [field], centralExtra: noBlock })
    const markedNotes = { ...NOTES, zip64: ['declaredBytes'] as const, centralExtra: noBlock }

    expect(await read([markedDocument('declaredBytes')])).toEqual(
      tooLarge('documentBytes', ARCHIVE_LIMITS.documentBytes),
    )
    expect(await read([storedDocument({}), markedNotes])).toEqual(
      tooLarge('inflatedBytes', ARCHIVE_LIMITS.inflatedBytes),
    )
    expect(await read([markedDocument('compressedBytes')])).toEqual(NOT_AN_ARCHIVE)
    expect(await read([markedDocument('localOffset')])).toEqual(NOT_AN_ARCHIVE)
  })

  it.each<[string, Uint8Array]>([
    ['an extra field of 3 bytes', new Uint8Array(3)],
    [
      'a first block that runs past the extra field and hides a ZIP64 block',
      joinBytes([
        extraBlock(OTHER_BLOCK_ID, new Uint8Array(4), 400),
        extraBlock(ZIP64_BLOCK_ID, wideBytes([LENGTH])),
      ]),
    ],
  ])('an extra field that cannot be walked counts as no block: %s', async (_case, centralExtra) => {
    const entry = storedDocument({ zip64: ['declaredBytes'], centralExtra })

    expect(await read([entry])).toEqual(tooLarge('documentBytes', ARCHIVE_LIMITS.documentBytes))
  })

  it.each<[string, Zip64EntryField, bigint | number | null]>([
    ['a compressed size of the length of the file', 'compressedBytes', null],
    ['a compressed size of 2^60', 'compressedBytes', HUGE],
    ['a local header offset of the length of the file', 'localOffset', null],
    ['a local header offset of 2^60', 'localOffset', HUGE],
  ])(
    'a ZIP64 compressed size or local header offset outside the file is data outside the file: %s',
    async (_case, field, value) => {
      const fileLength = buildZip([storedDocument({ zip64: [field] })]).length
      const zip64Values = { [field]: value ?? fileLength }

      expect(await read([storedDocument({ zip64: [field], zip64Values })])).toEqual(NOT_AN_ARCHIVE)
    },
  )
})

describe('readArchive refuses a size that only a ZIP64 block gives before it inflates', () => {
  const declaringDocument = (declaredBytes: bigint | number) =>
    documentEntry(DOCUMENT, {
      data: GARBAGE,
      zip64: ['declaredBytes'],
      zip64Values: { declaredBytes },
    })
  const declaringNotes = (declaredBytes: bigint | number): TestZipEntry => ({
    ...NOTES,
    data: GARBAGE,
    zip64: ['declaredBytes'],
    zip64Values: { declaredBytes },
  })

  it('a declared document size above documentBytes that only the ZIP64 block gives is refused before anything is inflated', async () => {
    const limits = limitsWith({ documentBytes: 100 })

    expect(await read([declaringDocument(101)], limits)).toEqual(tooLarge('documentBytes', 100))
    expect(await read([declaringDocument(100)], limits)).toEqual(NOT_AN_ARCHIVE)
  })

  it('a declared total above inflatedBytes that only ZIP64 blocks give is refused before anything is inflated', async () => {
    const limits = limitsWith({ inflatedBytes: 100 })
    const document = documentEntry(DOCUMENT, { data: GARBAGE, declaredBytes: 10 })

    expect(await read([document, declaringNotes(91)], limits)).toEqual(
      tooLarge('inflatedBytes', 100),
    )
    expect(await read([document, declaringNotes(90)], limits)).toEqual(NOT_AN_ARCHIVE)
  })

  it('a ZIP64 declared size of 2^60 is too large', async () => {
    expect(await read([declaringDocument(HUGE)])).toEqual(
      tooLarge('documentBytes', ARCHIVE_LIMITS.documentBytes),
    )
    expect(await read([storedDocument({}), declaringNotes(HUGE)])).toEqual(
      tooLarge('inflatedBytes', ARCHIVE_LIMITS.inflatedBytes),
    )
  })
})
