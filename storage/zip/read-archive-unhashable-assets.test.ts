// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate, and its digest is the real one.
import { deflateSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assetEntryName } from './archive-layout'
import { readArchive, type ArchiveRead } from './read-archive'
import {
  buildSharedZip,
  buildZipWithFaults,
  ENCRYPTED_ENTRY,
  expectRead,
  misnamedAssetEntry,
  readLists,
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
const MOULDING = encoder.encode('the profile of the picture rail')
const FAULTY = encoder.encode('an encrypted asset')
const STRAY = encoder.encode('bytes that belong to no name of the archive')
const RAIL = encoder.encode('a plate rail in the dining room')
/** Bytes that do not compress: their deflated data is about as long as they are. */
const BLOB = seededBytes(16 * 1024)
const BLOB_DATA = deflateSync(BLOB)
const STORED = 0
const SHORT_DECLARED_BYTES = 10
const SHARERS = 3
const HEX_RADIX = 16
const HASH_DIGITS = 64
const UNHASHABLE = 'the digest cannot hash these bytes'

/** Counts the calls of the digest where a spy stands; `undefined` where the digest is stubbed away. */
type DigestCalls = (() => number) | undefined

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Reads the archive and checks that the promise resolves, so that no case can pass by a rejection. */
async function readResolved(bytes: Uint8Array): Promise<ArchiveRead> {
  const read = readArchive(bytes)
  await expect(read).resolves.toBeDefined()
  return read
}

function viewOf(data: BufferSource): Uint8Array {
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return new Uint8Array(data)
}

function sameBytes(one: Uint8Array, other: Uint8Array): boolean {
  return one.length === other.length && one.every((byte, index) => byte === other[index])
}

/** The digest rejects for the bytes in `failing` and hashes all other bytes as usual. */
function digestRejectsFor(failing: readonly Uint8Array[]): () => number {
  const digest = crypto.subtle.digest.bind(crypto.subtle)
  const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation((algorithm, data) => {
    const bytes = viewOf(data)
    if (failing.some((one) => sameBytes(one, bytes))) return Promise.reject(new Error(UNHASHABLE))
    return digest(algorithm, data)
  })
  return () => spy.mock.calls.length
}

/** Each way the digest can fail for every asset. Install it after the archive and the hashes are made. */
const BROKEN_DIGESTS: readonly (readonly [string, () => DigestCalls])[] = [
  [
    'the digest rejects',
    () => {
      const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error(UNHASHABLE))
      return () => spy.mock.calls.length
    },
  ],
  [
    'the digest throws at once',
    () => {
      const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => {
        throw new Error(UNHASHABLE)
      })
      return () => spy.mock.calls.length
    },
  ],
  [
    'crypto.subtle is undefined',
    () => {
      vi.stubGlobal('crypto', {})
      return undefined
    },
  ],
  [
    'crypto is undefined',
    () => {
      vi.stubGlobal('crypto', undefined)
      return undefined
    },
  ],
]

/** The archive copied into a `SharedArrayBuffer`, as a view of it. */
function inSharedBuffer(bytes: Uint8Array): Uint8Array {
  const view = new Uint8Array(new SharedArrayBuffer(bytes.length))
  view.set(bytes)
  return view
}

/** The hexadecimal digits of a hash that names no bytes of these tests. */
function otherHash(index: number): string {
  return (index + 1).toString(HEX_RADIX).padStart(HASH_DIGITS, '0')
}

describe('readArchive rejects an asset whose bytes cannot be hashed', () => {
  it.each(BROKEN_DIGESTS)(
    'rejects every asset and reads the document when %s',
    async (_case, breakDigest) => {
      const entries = [
        await assetEntry(PICTURE),
        documentEntry(DOCUMENT),
        await assetEntry(SWATCH, { method: STORED }),
      ]
      const rejectedAssets = [await contentHashOf(PICTURE), await contentHashOf(SWATCH)]
      const bytes = buildZip(entries)
      breakDigest()

      expectRead(await readResolved(bytes), { document: DOCUMENT, assets: [], rejectedAssets })
    },
  )

  it('rejects only the asset whose hash fails and keeps the others in the order of the directory', async () => {
    const entries = [
      documentEntry(DOCUMENT),
      await assetEntry(PICTURE),
      await assetEntry(SWATCH),
      await assetEntry(MOULDING, { method: STORED }),
    ]
    const assets = [
      [await contentHashOf(PICTURE), PICTURE] as const,
      [await contentHashOf(MOULDING), MOULDING] as const,
    ]
    const rejectedAssets = [await contentHashOf(SWATCH)]
    const bytes = buildZip(entries)
    digestRejectsFor([SWATCH])

    expectRead(await readResolved(bytes), { document: DOCUMENT, assets, rejectedAssets })
  })

  it('rejects a stored asset of an archive in a shared buffer and keeps a deflated one, with the real digest', async () => {
    const entries = [
      documentEntry(DOCUMENT),
      await assetEntry(PICTURE, { method: STORED }),
      await assetEntry(SWATCH),
    ]
    const bytes = inSharedBuffer(buildZip(entries))

    expect(bytes.buffer).toBeInstanceOf(SharedArrayBuffer)
    expectRead(await readResolved(bytes), {
      document: DOCUMENT,
      assets: [[await contentHashOf(SWATCH), SWATCH]],
      rejectedAssets: [await contentHashOf(PICTURE)],
    })
  })

  it('lists an unhashable asset once, in the order of the directory, among unreadable and misnamed ones', async () => {
    const bytes = buildZipWithFaults([
      [await assetEntry(PICTURE), undefined],
      [await assetEntry(FAULTY), ENCRYPTED_ENTRY],
      [documentEntry(DOCUMENT), undefined],
      [await assetEntry(MOULDING), undefined],
      [await misnamedAssetEntry(STRAY, RAIL), undefined],
      [await assetEntry(SWATCH, { method: STORED }), undefined],
    ])
    const rejected = await Promise.all([PICTURE, FAULTY, RAIL, SWATCH].map(contentHashOf))
    const assets = [[await contentHashOf(MOULDING), MOULDING] as const]
    digestRejectsFor([PICTURE, SWATCH])

    expectRead(await readResolved(bytes), { document: DOCUMENT, assets, rejectedAssets: rejected })
  })
})

describe('readArchive refuses or reads as before when the digest fails', () => {
  it.each(BROKEN_DIGESTS)(
    'reads an archive with no asset when %s, and never calls the digest',
    async (_case, breakDigest) => {
      const bytes = buildZip([documentEntry(DOCUMENT)])
      const calls = breakDigest()

      expectRead(await readResolved(bytes), { document: DOCUMENT, assets: [], rejectedAssets: [] })
      expect(calls?.() ?? 0).toBe(0)
    },
  )

  it.each<[string, Partial<TestZipEntry>]>([
    ['deflated', {}],
    ['stored', { method: STORED }],
  ])(
    'refuses an asset that passes its declared size before any hash when the digest rejects (%s)',
    async (_case, overrides) => {
      const liar = await assetEntry(PICTURE, { declaredBytes: SHORT_DECLARED_BYTES, ...overrides })
      const bytes = buildZip([documentEntry(DOCUMENT), await assetEntry(SWATCH), liar])
      const calls = digestRejectsFor([PICTURE, SWATCH])

      expect(readLists(await readResolved(bytes))).toBe('not-an-archive')
      expect(calls()).toBe(0)
    },
  )

  it('refuses asset entries that share more data than the archive holds when the digest rejects', async () => {
    const owner = await assetEntry(BLOB, { data: BLOB_DATA })
    const sharers = Array.from({ length: SHARERS }, (_, index) => ({
      ...owner,
      name: assetEntryName(otherHash(index)),
    }))
    const document = documentEntry(DOCUMENT, { data: DOCUMENT_DATA })
    const bytes = buildSharedZip([document, owner], sharers, 1)
    const calls = digestRejectsFor([BLOB])

    expect((SHARERS + 1) * BLOB_DATA.length).toBeGreaterThan(bytes.length)
    expect(readLists(await readResolved(bytes))).toBe('not-an-archive')
    expect(calls()).toBe(0)
  })
})

describe('readArchive hashes with the real digest again after each case', () => {
  it('keeps a sound asset with the real digest, so every spy and stub was undone', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT), await assetEntry(PICTURE)])

    expect(globalThis.crypto.subtle.digest).toBe(Object.getPrototypeOf(crypto.subtle).digest)
    expectRead(await readResolved(bytes), {
      document: DOCUMENT,
      assets: [[await contentHashOf(PICTURE), PICTURE]],
      rejectedAssets: [],
    })
  })
})
