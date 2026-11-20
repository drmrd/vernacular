// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { readArchive, type ArchiveRead } from './read-archive'
import { limitsWith, SHORT_DECLARED_BYTES, tooLarge } from './read-archive-test-kit'
import {
  NAMES_LIKE_AN_ASSET,
  NAMES_LIKE_THE_DOCUMENT,
  NAMES_OUTSIDE_THE_LAYOUT,
} from './archive-names-test-kit'
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
const SECOND_DOCUMENT = encoder.encode('{"meta":{"name":"Oak Avenue"},"floors":[]}')
const PICTURE_BYTES = 300
const PICTURE = seededBytes(PICTURE_BYTES)
const SWATCH = encoder.encode('a small swatch of the parlor wallpaper')
const OUTSIDE_CONTENT = encoder.encode('an entry outside the layout')
/** fflate refuses these bytes as an invalid block, so inflating them gives `corrupt`. */
const GARBAGE = new Uint8Array(64).fill(0xff)
const STORED = 0
const UNKNOWN_METHOD = 12
const ENCRYPTED = 1
const OUTSIDE_DECLARED_BYTES = 500

const NOT_AN_ARCHIVE: ArchiveRead = { ok: false, failure: { kind: 'not-an-archive' } }
const NO_DOCUMENT: ArchiveRead = { ok: false, failure: { kind: 'no-document' } }

/** A content hash and the bytes it names. */
type HashedAsset = readonly [string, Uint8Array]

function readWith(document: Uint8Array, assets: readonly HashedAsset[] = []): ArchiveRead {
  return { ok: true, document, assets: new Map(assets), rejectedAssets: [] }
}

function outsideEntry(name: string, overrides: Partial<TestZipEntry> = {}): TestZipEntry {
  return { name, content: OUTSIDE_CONTENT, ...overrides }
}

/** The two assets with the larger hash first, so the order of the archive is not the order of the hashes. */
async function largerHashFirst(
  one: Uint8Array,
  other: Uint8Array,
): Promise<readonly [HashedAsset, HashedAsset]> {
  const first: HashedAsset = [await contentHashOf(one), one]
  const second: HashedAsset = [await contentHashOf(other), other]
  return first[0] > second[0] ? [first, second] : [second, first]
}

function assetKeys(read: ArchiveRead): string[] {
  return read.ok ? [...read.assets.keys()] : []
}

describe('readArchive takes only the document and the assets', () => {
  it('takes only the document and the assets of an archive that holds other entries', async () => {
    const outside = NAMES_OUTSIDE_THE_LAYOUT.map((name) => outsideEntry(name, { data: GARBAGE }))
    const middle = outside.length / 2
    const [earlier, later] = await largerHashFirst(PICTURE, SWATCH)
    const entries = [
      ...outside.slice(0, middle),
      await assetEntry(earlier[1]),
      documentEntry(DOCUMENT),
      ...outside.slice(middle),
      await assetEntry(later[1]),
    ]

    const read = await readArchive(buildZip(entries))

    expect(read).toEqual(readWith(DOCUMENT, [earlier, later]))
    expect(assetKeys(read)).toEqual([earlier[0], later[0]])
  })

  it.each(NAMES_LIKE_AN_ASSET)(
    'an asset name is assets/ and a content hash: a name with %s is in neither list',
    async (_case, nameOf) => {
      const name = nameOf(await contentHashOf(PICTURE))
      const bytes = buildZip([documentEntry(DOCUMENT), { name, content: PICTURE }])

      expect(await readArchive(bytes)).toEqual(readWith(DOCUMENT))
    },
  )

  it.each(NAMES_LIKE_THE_DOCUMENT)(
    'the document name is exactly vernacular.json: an entry named %s is not the document',
    async (name) => {
      const bytes = buildZip([{ name, content: DOCUMENT }])

      expect(await readArchive(bytes)).toEqual(NO_DOCUMENT)
    },
  )

  it('of two documents with one name the first is read', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT), documentEntry(SECOND_DOCUMENT)])

    expect(await readArchive(bytes)).toEqual(readWith(DOCUMENT))
  })

  it('of two assets with one name the first is read', async () => {
    const first = await assetEntry(PICTURE)
    const bytes = buildZip([documentEntry(DOCUMENT), first, { ...first, content: SWATCH }])

    expect(await readArchive(bytes)).toEqual(
      readWith(DOCUMENT, [[await contentHashOf(PICTURE), PICTURE]]),
    )
  })
})

describe('readArchive counts and skips the entries outside the layout', () => {
  it('an entry outside the layout counts toward the entry limit', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT), outsideEntry('notes.txt', { data: GARBAGE })])
    const entries = 2

    expect(await readArchive(bytes, limitsWith({ entries: entries - 1 }))).toEqual(
      tooLarge('entries', entries - 1),
    )
    expect(await readArchive(bytes, limitsWith({ entries }))).toEqual(readWith(DOCUMENT))
  })

  it('an entry outside the layout counts toward the declared total', async () => {
    const outside = outsideEntry('notes.txt', {
      data: GARBAGE,
      declaredBytes: OUTSIDE_DECLARED_BYTES,
    })
    const bytes = buildZip([documentEntry(DOCUMENT), outside])
    const total = DOCUMENT.length + OUTSIDE_DECLARED_BYTES

    expect(await readArchive(bytes, limitsWith({ inflatedBytes: total - 1 }))).toEqual(
      tooLarge('inflatedBytes', total - 1),
    )
    expect(await readArchive(bytes, limitsWith({ inflatedBytes: total }))).toEqual(
      readWith(DOCUMENT),
    )
  })

  it.each<[string, Partial<TestZipEntry>]>([
    ['an unknown method', { method: UNKNOWN_METHOD }],
    ['the encrypted flag', { flags: ENCRYPTED }],
  ])('an entry outside the layout with %s does not stop the read', async (_case, overrides) => {
    const bytes = buildZip([outsideEntry('notes.txt', overrides), documentEntry(DOCUMENT)])

    expect(await readArchive(bytes)).toEqual(readWith(DOCUMENT))
  })
})

describe('readArchive inflates each asset entry of the layout', () => {
  it.each<[string, Partial<TestZipEntry>]>([
    ['deflated', {}],
    ['stored', { method: STORED }],
  ])(
    'an asset entry that passes its declared size makes the archive not an archive (%s)',
    async (_case, overrides) => {
      const asset = await assetEntry(PICTURE, {
        declaredBytes: SHORT_DECLARED_BYTES,
        ...overrides,
      })
      const bytes = buildZip([documentEntry(DOCUMENT), asset])

      expect(await readArchive(bytes)).toEqual(NOT_AN_ARCHIVE)
    },
  )

  it('an asset entry whose three fields hold the marker is read like a classic one', async () => {
    const asset = await assetEntry(PICTURE, {
      zip64: ['declaredBytes', 'compressedBytes', 'localOffset'],
    })
    const bytes = buildZip([documentEntry(DOCUMENT), asset])

    expect(await readArchive(bytes)).toEqual(
      readWith(DOCUMENT, [[await contentHashOf(PICTURE), PICTURE]]),
    )
  })
})
