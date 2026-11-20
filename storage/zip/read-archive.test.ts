// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { deflateSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ARCHIVE_LIMITS, type ArchiveLimitName, type ArchiveLimits } from './archive-limits'
import { inflateEntry, INFLATE_SLICE_BYTES } from './inflate-entry'
import { readArchive, type ArchiveRead } from './read-archive'
import { zipFolder } from './zip-codec'
import { buildZip, documentEntry, seededBytes, type TestZipEntry } from './zip-test-kit'

const encoder = new TextEncoder()
const DOCUMENT = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const NOTES: TestZipEntry = { name: 'notes.txt', content: encoder.encode('a note beside it') }
/** fflate refuses these bytes as an invalid block, so inflating them gives `corrupt`. */
const GARBAGE = new Uint8Array(64).fill(0xff)
const END_RECORD_BYTES = 22
const END_RECORD_SIGNATURE = 0x06054b50

const NOT_AN_ARCHIVE: ArchiveRead = { ok: false, failure: { kind: 'not-an-archive' } }
const NO_DOCUMENT: ArchiveRead = { ok: false, failure: { kind: 'no-document' } }

function documentRead(document: Uint8Array): ArchiveRead {
  return { ok: true, document, assets: new Map(), rejectedAssets: [] }
}

function tooLarge(limit: ArchiveLimitName, allowed: number): ArchiveRead {
  return { ok: false, failure: { kind: 'too-large', limit, allowed } }
}

function limitsWith(overrides: Partial<ArchiveLimits>): ArchiveLimits {
  return { ...ARCHIVE_LIMITS, ...overrides }
}

describe('readArchive reads a sound archive', () => {
  it('ARCHIVE_LIMITS holds 512 MB, 1 GB, 10,000 entries, and 64 MB, and is frozen', () => {
    expect(ARCHIVE_LIMITS).toEqual({
      archiveBytes: 536_870_912,
      inflatedBytes: 1_073_741_824,
      entries: 10_000,
      documentBytes: 67_108_864,
    })
    expect(Object.isFrozen(ARCHIVE_LIMITS)).toBe(true)
  })

  it('reads the document of an archive that the application wrote', async () => {
    const snapshot = encoder.encode('{"snapshot":true}')
    const bytes = zipFolder(
      new Map([
        ['vernacular.json', DOCUMENT],
        ['.house-autosave/snapshot-1.json', snapshot],
      ]),
    )

    expect(await readArchive(bytes)).toEqual(documentRead(DOCUMENT))
  })

  it('reads a document that is stored without compression', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT, { method: 0 })])

    expect(await readArchive(bytes)).toEqual(documentRead(DOCUMENT))
  })

  it('reads with the default limits when none are given', async () => {
    expect(await readArchive(buildZip([documentEntry(DOCUMENT)]))).toEqual(documentRead(DOCUMENT))
    expect(await readArchive(buildZip([], { declaredEntries: 10_001 }))).toEqual(
      tooLarge('entries', 10_000),
    )
  })

  it('reads an archive whose comment holds an end record signature', async () => {
    const comment = new Uint8Array(32)
    const view = new DataView(comment.buffer)
    view.setUint32(0, END_RECORD_SIGNATURE, true)
    view.setUint16(20, 0xffff, true)
    const bytes = buildZip([documentEntry(DOCUMENT)], { comment })

    expect(await readArchive(bytes)).toEqual(documentRead(DOCUMENT))
  })

  it('reads an entry written with a data descriptor whose content holds a header signature', async () => {
    const nested = buildZip([{ name: 'inner.json', content: DOCUMENT, method: 0 }])
    const bytes = buildZip([documentEntry(nested, { method: 0, dataDescriptor: true }), NOTES])

    expect(await readArchive(bytes)).toEqual(documentRead(nested))
  })

  it('takes the size from the central directory, not from the local header', async () => {
    const localSaysLess = buildZip([documentEntry(DOCUMENT, { localDeclaredBytes: 3 })])
    const centralSaysMore = buildZip([
      documentEntry(DOCUMENT, {
        declaredBytes: DOCUMENT.length + 1,
        localDeclaredBytes: DOCUMENT.length,
      }),
    ])

    expect(await readArchive(localSaysLess)).toEqual(documentRead(DOCUMENT))
    expect(await readArchive(centralSaysMore)).toEqual(NOT_AN_ARCHIVE)
  })

  it('does not change the bytes it is given', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT, { method: 0 }), NOTES])
    const before = bytes.slice()

    expect(await readArchive(bytes)).toEqual(documentRead(DOCUMENT))
    expect(bytes).toEqual(before)
  })
})

describe('readArchive refuses an archive above a limit', () => {
  it('an archive above archiveBytes is refused before anything is read', async () => {
    const bytes = encoder.encode('x'.repeat(101))

    expect(await readArchive(bytes, limitsWith({ archiveBytes: 100 }))).toEqual(
      tooLarge('archiveBytes', 100),
    )
    expect(await readArchive(bytes, limitsWith({ archiveBytes: 101 }))).toEqual(NOT_AN_ARCHIVE)
  })

  it('an archive of exactly archiveBytes is read', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT)])

    expect(await readArchive(bytes, limitsWith({ archiveBytes: bytes.length }))).toEqual(
      documentRead(DOCUMENT),
    )
    expect(await readArchive(bytes, limitsWith({ archiveBytes: bytes.length - 1 }))).toEqual(
      tooLarge('archiveBytes', bytes.length - 1),
    )
  })

  it('more entries than the limit are refused from the end record', async () => {
    const entries = [documentEntry(DOCUMENT, { data: GARBAGE }), { ...NOTES, data: GARBAGE }]
    const limits = limitsWith({ entries: 2 })

    expect(await readArchive(buildZip(entries, { declaredEntries: 3 }), limits)).toEqual(
      tooLarge('entries', 2),
    )
    expect(await readArchive(buildZip(entries), limits)).toEqual(NOT_AN_ARCHIVE)
  })

  it('a declared document above documentBytes is refused from the central directory', async () => {
    const limits = limitsWith({ documentBytes: 100 })
    const declaring = (declaredBytes: number) =>
      buildZip([documentEntry(DOCUMENT, { data: GARBAGE, declaredBytes })])

    expect(await readArchive(declaring(101), limits)).toEqual(tooLarge('documentBytes', 100))
    expect(await readArchive(declaring(100), limits)).toEqual(NOT_AN_ARCHIVE)
  })

  it('a declared total above inflatedBytes is refused from the central directory', async () => {
    const limits = limitsWith({ inflatedBytes: 100 })
    const declaring = (notesBytes: number) =>
      buildZip([
        documentEntry(DOCUMENT, { data: GARBAGE, declaredBytes: 40 }),
        { ...NOTES, data: GARBAGE, declaredBytes: notesBytes },
      ])

    expect(await readArchive(declaring(61), limits)).toEqual(tooLarge('inflatedBytes', 100))
    expect(await readArchive(declaring(60), limits)).toEqual(NOT_AN_ARCHIVE)
  })
})

describe('readArchive refuses an archive it cannot trust', () => {
  it('stops inflating an entry that passes the declared size', async () => {
    const content = seededBytes(2 * 1024 * 1024)
    const data = deflateSync(content, { level: 0 })
    const bytes = buildZip([documentEntry(content, { data, declaredBytes: 10 })])

    expect(await readArchive(bytes)).toEqual(NOT_AN_ARCHIVE)
    const inflated = inflateEntry({ data, method: 8, declaredBytes: 10 })
    expect(inflated).toMatchObject({ ok: false, reason: 'passes-declared-size' })
    const count = inflated.ok ? Number.NaN : inflated.inflatedBytes
    expect(count).toBeGreaterThan(10)
    expect(count).toBeLessThan(10 + 2 * INFLATE_SLICE_BYTES)
  })

  it('a document that inflates to less than it declares is not an archive', async () => {
    const declaredBytes = DOCUMENT.length + 1
    const deflated = buildZip([documentEntry(DOCUMENT, { declaredBytes })])
    const stored = buildZip([documentEntry(DOCUMENT, { method: 0, declaredBytes })])

    expect(await readArchive(deflated)).toEqual(NOT_AN_ARCHIVE)
    expect(await readArchive(stored)).toEqual(NOT_AN_ARCHIVE)
  })

  it.each<[string, Partial<TestZipEntry>]>([
    ['a corrupt stream', { data: GARBAGE }],
    ['an unsupported method', { method: 12 }],
    ['the encrypted flag', { flags: 1 }],
  ])('a document with %s is not an archive', async (_case, overrides) => {
    const bytes = buildZip([documentEntry(DOCUMENT, overrides)])

    expect(await readArchive(bytes)).toEqual(NOT_AN_ARCHIVE)
  })

  it.each<[string, Uint8Array]>([
    ['no bytes', new Uint8Array(0)],
    ['21 bytes', buildZip([]).slice(0, END_RECORD_BYTES - 1)],
    ['plain text', encoder.encode('this is plain text and holds no end record at all')],
  ])('bytes with no end record are not an archive: %s', async (_case, bytes) => {
    expect(await readArchive(bytes)).toEqual(NOT_AN_ARCHIVE)
  })

  it('an archive with no vernacular.json gives no-document, and so does an archive with no entry', async () => {
    expect(await readArchive(buildZip([NOTES]))).toEqual(NO_DOCUMENT)
    expect(await readArchive(buildZip([]))).toEqual(NO_DOCUMENT)
  })

  it('an end record that declares more entries than the directory holds is not an archive', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT)], { declaredEntries: 2 })

    expect(await readArchive(bytes)).toEqual(NOT_AN_ARCHIVE)
  })

  it('a document whose local header offset points outside the file is not an archive', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT)])
    const view = new DataView(bytes.buffer)
    const directoryOffset = view.getUint32(bytes.length - END_RECORD_BYTES + 16, true)
    view.setUint32(directoryOffset + 42, bytes.length, true)

    expect(await readArchive(bytes)).toEqual(NOT_AN_ARCHIVE)
  })

  it('every prefix of a sound archive resolves, and none is read as ok', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT), NOTES])
    const prefixes = Array.from({ length: bytes.length }, (_, length) => bytes.slice(0, length))

    const reads: ArchiveRead[] = await Promise.all(prefixes.map((prefix) => readArchive(prefix)))

    expect(reads.filter((read) => read.ok)).toEqual([])
  })
})
