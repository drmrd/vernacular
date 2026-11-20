// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { describe, it } from 'vitest'
import { assetEntryName } from './archive-layout'
import { readArchive } from './read-archive'
import {
  ASSET_FAULTS,
  buildZipWithFaults,
  CORRUPT_STREAM,
  expectRead,
  misnamedAssetEntry,
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
const PICTURE = seededBytes(300)
const SWATCH = encoder.encode('a small swatch of the parlor wallpaper')
const FAULTY = encoder.encode('an asset with a fault')
const MOULDING = encoder.encode('the profile of the picture rail')
const EMPTY = new Uint8Array(0)
const STORED = 0
const HEX_RADIX = 16
const HASH_DIGITS = 64
/** How many empty assets with a wrong name stand around the one with the right name. */
const WRONG_EMPTY_NAMES = 3

async function hashed(bytes: Uint8Array): Promise<HashedAsset> {
  return [await contentHashOf(bytes), bytes]
}

/** The hexadecimal digits of a hash that names no bytes of these tests. */
function otherHash(index: number): string {
  return (index + 1).toString(HEX_RADIX).padStart(HASH_DIGITS, '0')
}

/** The hashes of `one` and `other`, the larger first, so the order of an archive is not the order of the hashes. */
async function largerHashFirst(
  one: Uint8Array,
  other: Uint8Array,
): Promise<readonly [Uint8Array, Uint8Array]> {
  return (await contentHashOf(one)) > (await contentHashOf(other)) ? [one, other] : [other, one]
}

describe('readArchive keeps an asset whose bytes hash to its name', () => {
  it('an asset whose bytes hash to its name is in assets under that hash', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT), await assetEntry(PICTURE)])

    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [await hashed(PICTURE)],
      rejectedAssets: [],
    })
  })

  it('an asset stored without compression is read', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT), await assetEntry(SWATCH, { method: STORED })])

    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [await hashed(SWATCH)],
      rejectedAssets: [],
    })
  })

  it.each<[string, Partial<TestZipEntry>]>([
    ['deflated', {}],
    ['stored', { method: STORED }],
  ])(
    'an asset of no bytes named by the hash of no bytes is read (%s)',
    async (_case, overrides) => {
      const bytes = buildZip([documentEntry(DOCUMENT), await assetEntry(EMPTY, overrides)])

      expectRead(await readArchive(bytes), {
        document: DOCUMENT,
        assets: [await hashed(EMPTY)],
        rejectedAssets: [],
      })
    },
  )
})

describe('readArchive rejects an asset whose bytes do not hash to its name', () => {
  it('an asset whose bytes match another hash is in rejectedAssets and not in assets', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT), await misnamedAssetEntry(PICTURE, SWATCH)])

    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [],
      rejectedAssets: [await contentHashOf(SWATCH)],
    })
  })

  it('a rejected asset does not stop the document or the other assets', async () => {
    const entries = [
      await assetEntry(PICTURE),
      await misnamedAssetEntry(FAULTY, MOULDING),
      documentEntry(DOCUMENT),
      await assetEntry(SWATCH, { method: STORED }),
    ]

    expectRead(await readArchive(buildZip(entries)), {
      document: DOCUMENT,
      assets: [await hashed(PICTURE), await hashed(SWATCH)],
      rejectedAssets: [await contentHashOf(MOULDING)],
    })
  })

  it('assets of no bytes whose names are not the hash of no bytes are rejected, and the one with that name is read', async () => {
    const wrongNames = Array.from({ length: WRONG_EMPTY_NAMES }, (_, index) => otherHash(index))
    const wrong = wrongNames.map((hash) => ({ name: assetEntryName(hash), content: EMPTY }))
    const entries = [
      documentEntry(DOCUMENT),
      ...wrong.slice(0, 1),
      await assetEntry(EMPTY),
      ...wrong.slice(1),
    ]

    expectRead(await readArchive(buildZip(entries)), {
      document: DOCUMENT,
      assets: [await hashed(EMPTY)],
      rejectedAssets: wrongNames,
    })
  })
})

describe('readArchive rejects an asset entry that cannot be read', () => {
  it.each(ASSET_FAULTS)('an asset with %s is in rejectedAssets', async (_case, fault) => {
    const bytes = buildZipWithFaults([
      [await assetEntry(PICTURE), undefined],
      [await assetEntry(FAULTY), fault],
      [documentEntry(DOCUMENT), undefined],
      [await assetEntry(SWATCH, { method: STORED }), undefined],
    ])

    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [await hashed(PICTURE), await hashed(SWATCH)],
      rejectedAssets: [await contentHashOf(FAULTY)],
    })
  })

  it('rejectedAssets is in the order of the central directory and holds each hash once', async () => {
    const [misnamedFor, faulty] = await largerHashFirst(MOULDING, FAULTY)
    const misnamed = await misnamedAssetEntry(PICTURE, misnamedFor)
    const bytes = buildZipWithFaults([
      [documentEntry(DOCUMENT), undefined],
      [misnamed, undefined],
      [await assetEntry(faulty), CORRUPT_STREAM],
      [{ ...misnamed, content: SWATCH }, undefined],
      [await assetEntry(faulty), CORRUPT_STREAM],
    ])

    expectRead(await readArchive(bytes), {
      document: DOCUMENT,
      assets: [],
      rejectedAssets: [await contentHashOf(misnamedFor), await contentHashOf(faulty)],
    })
  })
})
