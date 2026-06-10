import { describe, expect, it } from 'vitest'
import { InMemoryAssetSource } from './in-memory-asset-source'

const HASH = 'abc123'
const BYTES = Uint8Array.of(9, 8, 7)

describe('InMemoryAssetSource', () => {
  it('exposes the id it was constructed with', () => {
    const source = new InMemoryAssetSource('user')
    expect(source.id).toBe('user')
  })

  it('reads back bytes registered under a content hash', async () => {
    const source = new InMemoryAssetSource('user', { [HASH]: BYTES })
    expect(await source.read(HASH)).toEqual(BYTES)
  })

  it('returns undefined for a content hash it does not hold', async () => {
    const source = new InMemoryAssetSource('user')
    expect(await source.read(HASH)).toBeUndefined()
  })

  it('isolates stored bytes from later mutation of the caller input', async () => {
    const bytes = Uint8Array.of(1, 2, 3)
    const source = new InMemoryAssetSource('user', { [HASH]: bytes })
    bytes[0] = 0xff
    expect(await source.read(HASH)).toEqual(Uint8Array.of(1, 2, 3))
  })
})
