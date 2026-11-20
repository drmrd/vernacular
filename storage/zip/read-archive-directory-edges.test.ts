// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { ARCHIVE_LIMITS } from './archive-limits'
import { readArchive, type ArchiveRead } from './read-archive'
import { withUint16, withUint32 } from './zip-edges-test-kit'
import { buildZip, documentEntry, seededBytes, type TestZipEntry } from './zip-test-kit'
import { joinBytes } from './zip64-test-kit'

const encoder = new TextEncoder()
const FIRST = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const SECOND = encoder.encode('{"meta":{"name":"Oak Avenue"},"floors":[]}')
const STORED = 0
const NOTES: TestZipEntry = { name: 'notes.txt', content: encoder.encode('a note beside it') }
const NOT_AN_ARCHIVE: ArchiveRead = { ok: false, failure: { kind: 'not-an-archive' } }
const NO_DOCUMENT: ArchiveRead = { ok: false, failure: { kind: 'no-document' } }

const END_RECORD_BYTES = 22
const END_DIRECTORY_SIZE_AT = 12
const END_DIRECTORY_OFFSET_AT = 16
const LOCAL_HEADER_BYTES = 30
const LOCAL_NAME_LENGTH_AT = 26
const LOCAL_EXTRA_LENGTH_AT = 28
const CENTRAL_NAME_LENGTH_AT = 28
const CENTRAL_EXTRA_LENGTH_AT = 30
const CENTRAL_COMMENT_LENGTH_AT = 32
const CENTRAL_LOCAL_OFFSET_AT = 42
const LARGEST_SHORT = 0xffff
const BAD_SIGNATURE = 0
const OTHER_NAME = 'other-name.json'
const DOCUMENT_NAME = 'vernacular.json'
const BYTES_AROUND = 37

function documentRead(document: Uint8Array): ArchiveRead {
  return { ok: true, document, assets: new Map(), rejectedAssets: [] }
}

/** Where the central directory starts, for an archive with no comment and no ZIP64 records. */
function directoryOffsetOf(archive: Uint8Array): number {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.length)
  return view.getUint32(archive.length - END_RECORD_BYTES + END_DIRECTORY_OFFSET_AT, true)
}

/** An archive with one stored document, so that every offset is easy to compute. */
function storedDocument(): Uint8Array {
  return buildZip([documentEntry(FIRST, { method: STORED })])
}

describe('readArchive picks the document from the central directory', () => {
  it('reads the first of two entries that are named vernacular.json', async () => {
    const bytes = buildZip([documentEntry(FIRST), documentEntry(SECOND)])

    expect(await readArchive(bytes)).toEqual(documentRead(FIRST))
  })

  it('takes the name of the central directory, not the name of the local header', async () => {
    const nameAt = LOCAL_HEADER_BYTES
    const centralIsDocument = buildZip([{ name: DOCUMENT_NAME, content: FIRST, method: STORED }])
    const centralIsOther = buildZip([{ name: OTHER_NAME, content: FIRST, method: STORED }])
    expect(OTHER_NAME).toHaveLength(DOCUMENT_NAME.length)
    const localSaysOther = centralIsDocument.slice()
    localSaysOther.set(encoder.encode(OTHER_NAME), nameAt)
    const localSaysDocument = centralIsOther.slice()
    localSaysDocument.set(encoder.encode(DOCUMENT_NAME), nameAt)

    expect(await readArchive(localSaysOther)).toEqual(documentRead(FIRST))
    expect(await readArchive(localSaysDocument)).toEqual(NO_DOCUMENT)
  })
})

describe('readArchive reads an archive that is a view into a larger buffer', () => {
  it.each<[string, Partial<TestZipEntry>]>([
    ['stored', { method: STORED }],
    ['deflated', {}],
  ])('gives the same result as a copy of the bytes: %s document', async (_case, overrides) => {
    const archive = buildZip([documentEntry(FIRST, overrides), NOTES])
    const another = buildZip([documentEntry(SECOND)])
    const before = seededBytes(BYTES_AROUND)
    const after = joinBytes([another, seededBytes(BYTES_AROUND)])
    const buffer = joinBytes([before, archive, after])
    const view = buffer.subarray(before.length, before.length + archive.length)

    expect(await readArchive(view)).toEqual(await readArchive(archive.slice()))
    expect(await readArchive(view)).toEqual(documentRead(FIRST))
  })
})

describe('readArchive refuses a local header that does not fit the file', () => {
  it('a wrong signature of the local header of the document is not an archive', async () => {
    expect(await readArchive(withUint32(storedDocument(), 0, BAD_SIGNATURE))).toEqual(
      NOT_AN_ARCHIVE,
    )
  })

  it.each([
    ['name length', LOCAL_NAME_LENGTH_AT],
    ['extra length', LOCAL_EXTRA_LENGTH_AT],
  ])('a local %s that pushes the data past the end is not an archive', async (_case, at) => {
    expect(await readArchive(withUint16(storedDocument(), at, LARGEST_SHORT))).toEqual(
      NOT_AN_ARCHIVE,
    )
  })

  it('a local header that does not lie whole inside the file is not an archive', async () => {
    const bytes = storedDocument()
    const offset = bytes.length - LOCAL_HEADER_BYTES + 1

    const patched = withUint32(bytes, directoryOffsetOf(bytes) + CENTRAL_LOCAL_OFFSET_AT, offset)

    expect(await readArchive(patched)).toEqual(NOT_AN_ARCHIVE)
  })
})

describe('readArchive refuses a central directory that does not fit', () => {
  it('a wrong signature of the first entry of the directory is not an archive', async () => {
    const bytes = buildZip([documentEntry(FIRST), NOTES])

    expect(await readArchive(withUint32(bytes, directoryOffsetOf(bytes), BAD_SIGNATURE))).toEqual(
      NOT_AN_ARCHIVE,
    )
  })

  it.each([
    ['name', CENTRAL_NAME_LENGTH_AT],
    ['extra field', CENTRAL_EXTRA_LENGTH_AT],
    ['comment', CENTRAL_COMMENT_LENGTH_AT],
  ])('an entry whose %s runs past the directory is not an archive', async (_case, at) => {
    const bytes = buildZip([documentEntry(FIRST), NOTES])

    const patched = withUint16(bytes, directoryOffsetOf(bytes) + at, LARGEST_SHORT)

    expect(await readArchive(patched)).toEqual(NOT_AN_ARCHIVE)
  })

  it('a directory that ends one byte past the end record is not an archive', async () => {
    const bytes = storedDocument()
    const sizeAt = bytes.length - END_RECORD_BYTES + END_DIRECTORY_SIZE_AT
    const size = new DataView(bytes.buffer).getUint32(sizeAt, true)

    expect(await readArchive(withUint32(bytes, sizeAt, size + 1))).toEqual(NOT_AN_ARCHIVE)
  })
})

describe('readArchive never rejects', () => {
  it('limits that throw when they are read give not-an-archive', async () => {
    const limits = { ...ARCHIVE_LIMITS }
    Object.defineProperty(limits, 'archiveBytes', {
      get: () => {
        throw new Error('the limits cannot be read')
      },
    })

    await expect(readArchive(storedDocument(), limits)).resolves.toEqual(NOT_AN_ARCHIVE)
  })
})
