// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate, and its digest is the real one.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inLargerBuffer, readResolved, SHORT_DECLARED_BYTES, viewOf } from './read-archive-test-kit'
import { ENCRYPTED_ENTRY, buildZipWithFaults, expectRead, readLists } from './zip-edges-test-kit'
import { assetEntry, buildZip, contentHashOf, documentEntry, seededBytes } from './zip-test-kit'

const encoder = new TextEncoder()
const DOCUMENT = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const PICTURE = seededBytes(300)
const SWATCH = encoder.encode('a small swatch of the parlor wallpaper')
const FAULTY = encoder.encode('an encrypted asset')
const STORED = 0
/** A value that is no buffer, given by a broken digest in place of one. */
const NOT_A_BUFFER = 42

afterEach(() => {
  vi.restoreAllMocks()
})

/** Detaches the buffer, as a caller does that transfers it to a worker. */
function detach(buffer: ArrayBufferLike): void {
  structuredClone(buffer, { transfer: [buffer as ArrayBuffer] })
}

describe('readArchive hashes each readable first entry once', () => {
  it('calls the digest once for a sound asset, and not for an encrypted one or for a later entry of either name', async () => {
    const sound = await assetEntry(PICTURE)
    const encrypted = await assetEntry(FAULTY)
    const bytes = buildZipWithFaults([
      [documentEntry(DOCUMENT), undefined],
      [sound, undefined],
      [encrypted, ENCRYPTED_ENTRY],
      [encrypted, undefined],
      [{ ...sound, content: SWATCH }, undefined],
    ])
    const assets = [[await contentHashOf(PICTURE), PICTURE] as const]
    const rejectedAssets = [await contentHashOf(FAULTY)]
    const digest = vi.spyOn(crypto.subtle, 'digest')

    expectRead(await readResolved(bytes), { document: DOCUMENT, assets, rejectedAssets })
    expect(digest).toHaveBeenCalledTimes(1)
    expect(viewOf(digest.mock.calls[0]?.[1] ?? new Uint8Array(0))).toEqual(PICTURE)
  })

  it('refuses an archive whose asset passes its declared size after an encrypted asset', async () => {
    const liar = await assetEntry(PICTURE, { declaredBytes: SHORT_DECLARED_BYTES })
    const bytes = buildZipWithFaults([
      [documentEntry(DOCUMENT), undefined],
      [await assetEntry(FAULTY), ENCRYPTED_ENTRY],
      [liar, undefined],
    ])

    expect(readLists(await readResolved(bytes))).toBe('not-an-archive')
  })

  it('keeps a stored asset as a view into the caller buffer, under the hash of its bytes', async () => {
    const archive = buildZip([
      documentEntry(DOCUMENT),
      await assetEntry(PICTURE, { method: STORED }),
    ])
    const bytes = inLargerBuffer(archive)
    const hash = await contentHashOf(PICTURE)

    const read = await readResolved(bytes)
    const asset = read.ok ? read.assets.get(hash) : undefined

    expect(read.ok && [...read.assets.keys()]).toEqual([hash])
    expect(asset).toEqual(PICTURE)
    expect(asset?.buffer).toBe(bytes.buffer)
    expect(asset?.byteOffset).toBeGreaterThanOrEqual(bytes.byteOffset)
    expect((asset?.byteOffset ?? 0) + (asset?.length ?? 0)).toBeLessThanOrEqual(
      bytes.byteOffset + bytes.length,
    )
  })
})

describe('readArchive with a buffer or a digest that misbehaves', () => {
  it('refuses an archive whose buffer was detached before the call', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT), await assetEntry(PICTURE)])
    detach(bytes.buffer)

    expect(bytes.length).toBe(0)
    expect(readLists(await readResolved(bytes))).toBe('not-an-archive')
  })

  it('rejects an asset when the digest resolves with something that is no buffer', async () => {
    const bytes = buildZip([documentEntry(DOCUMENT), await assetEntry(PICTURE)])
    const rejectedAssets = [await contentHashOf(PICTURE)]
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(NOT_A_BUFFER as unknown as ArrayBuffer)

    expectRead(await readResolved(bytes), { document: DOCUMENT, assets: [], rejectedAssets })
  })

  // A known limit, pinned so that a change of it is seen: the caller must not change or transfer
  // the buffer of the archive until the promise settles. An accepted stored asset is a view into
  // that buffer, and the assets after the transfer are hashed over no bytes.
  it('keeps the first stored asset as an empty view and rejects the second when the buffer is transferred after the first hash', async () => {
    const entries = [
      documentEntry(DOCUMENT),
      await assetEntry(PICTURE, { method: STORED }),
      await assetEntry(SWATCH, { method: STORED }),
    ]
    const bytes = buildZip(entries)
    const [first, second] = [await contentHashOf(PICTURE), await contentHashOf(SWATCH)]
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce((algorithm, data) => {
      const hashed = digest(algorithm, data)
      detach(bytes.buffer)
      return hashed
    })

    const read = await readResolved(bytes)

    expect(readLists(read)).toEqual({ assets: [first], rejectedAssets: [second] })
    expect(read.ok && read.document).toEqual(DOCUMENT)
    expect(read.ok && read.assets.get(first)?.length).toBe(0)
  })
})
