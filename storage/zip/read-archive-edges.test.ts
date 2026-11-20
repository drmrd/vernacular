// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { deflateSync, unzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { INFLATE_SLICE_BYTES } from './inflate-entry'
import { readArchive, type ArchiveRead } from './read-archive'
import { recordPushedChunks } from './zip-edges-test-kit'
import { buildZip, documentEntry } from './zip-test-kit'
import { joinBytes } from './zip64-test-kit'

const encoder = new TextEncoder()
const FIRST = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const SECOND = encoder.encode('{"meta":{"name":"Oak Avenue"},"floors":[]}')
const DOCUMENT_NAME = 'vernacular.json'
const BYTE_ORDER_MARK = '﻿'
const SLICES_AFTER_THE_END = 10
/** The slice that completes the output, and one more. */
const SLICES_FED_AT_MOST = 2
const PUSHES_AT_MOST = 3
/** Two slices give no output, and the next one is the last that is fed, after the slice with the output. */
const SLICES_FED_FOR_A_SHORT_STREAM = 4
const PUSHES_FOR_A_SHORT_STREAM = 4

const NO_DOCUMENT: ArchiveRead = { ok: false, failure: { kind: 'no-document' } }
const NOT_AN_ARCHIVE: ArchiveRead = { ok: false, failure: { kind: 'not-an-archive' } }

function documentRead(document: Uint8Array): ArchiveRead {
  return { ok: true, document, assets: new Map(), rejectedAssets: [] }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readArchive does not feed the bytes after the end of a stream', () => {
  it('reads a document whose data is followed by many bytes that no stream uses', async () => {
    const trailing = new Uint8Array(SLICES_AFTER_THE_END * INFLATE_SLICE_BYTES)
    const data = joinBytes([deflateSync(FIRST), trailing])
    const pushed = recordPushedChunks()

    expect(await readArchive(buildZip([documentEntry(FIRST, { data })]))).toEqual(
      documentRead(FIRST),
    )

    expect(pushed().bytes).toBeLessThanOrEqual(SLICES_FED_AT_MOST * INFLATE_SLICE_BYTES)
    expect(pushed().calls).toBeLessThanOrEqual(PUSHES_AT_MOST)
  })
})

describe('readArchive does not feed the bytes after a stream that gives less than declared', () => {
  it('refuses a document that declares one byte more than its stream gives', async () => {
    const trailing = new Uint8Array(SLICES_AFTER_THE_END * INFLATE_SLICE_BYTES)
    const data = joinBytes([deflateSync(FIRST), trailing])
    const bytes = buildZip([documentEntry(FIRST, { data, declaredBytes: FIRST.length + 1 })])
    const pushed = recordPushedChunks()

    expect(await readArchive(bytes)).toEqual(NOT_AN_ARCHIVE)

    expect(pushed().bytes).toBeLessThanOrEqual(SLICES_FED_FOR_A_SHORT_STREAM * INFLATE_SLICE_BYTES)
    expect(pushed().calls).toBeLessThanOrEqual(PUSHES_FOR_A_SHORT_STREAM)
  })
})

describe('readArchive compares names as they are, with a byte order mark kept', () => {
  it('an entry named with a leading byte order mark is not the document', async () => {
    const bytes = buildZip([{ name: BYTE_ORDER_MARK + DOCUMENT_NAME, content: FIRST }])

    expect(await readArchive(bytes)).toEqual(NO_DOCUMENT)
  })

  it('reads the real document when an entry with a leading byte order mark stands before it', async () => {
    const bytes = buildZip([
      { name: BYTE_ORDER_MARK + DOCUMENT_NAME, content: FIRST },
      documentEntry(SECOND),
    ])

    const names = Object.keys(unzipSync(bytes))
    expect(names).toHaveLength(2)
    expect(names).toContain(DOCUMENT_NAME)
    expect(unzipSync(bytes)[DOCUMENT_NAME]).toEqual(SECOND)
    expect(await readArchive(bytes)).toEqual(documentRead(SECOND))
  })

  it.each([
    ['in the middle of the name', `vernacular${BYTE_ORDER_MARK}.json`],
    ['after the name', DOCUMENT_NAME + BYTE_ORDER_MARK],
  ])('a byte order mark %s matches nothing', async (_case, name) => {
    const bytes = buildZip([{ name, content: FIRST }])

    expect(await readArchive(bytes)).toEqual(NO_DOCUMENT)
  })
})
