import { describe, expect, it } from 'vitest'
import type { AssetReference } from '../../core'
import { AssetRegistry } from './asset-registry'
import { InMemoryAssetSource } from './in-memory-asset-source'

const HASH = 'abc123'
const BYTES = Uint8Array.of(1, 1, 1)
const OTHER_BYTES = Uint8Array.of(2, 2, 2)

describe('AssetRegistry resolution', () => {
  it('returns the bytes from the exactly-requested scope when present', async () => {
    const registry = new AssetRegistry([
      { kind: 'project', source: new InMemoryAssetSource('project', { [HASH]: BYTES }) },
      { kind: 'user', source: new InMemoryAssetSource('user', { [HASH]: OTHER_BYTES }) },
    ])
    const reference: AssetReference = { scope: 'project', contentHash: HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.bytes).toEqual(BYTES)
      expect(resolution.resolvedScope).toBe('project')
    }
  })

  it('falls back to a hash match in a higher-precedence scope', async () => {
    const registry = new AssetRegistry([
      { kind: 'user', source: new InMemoryAssetSource('user', { [HASH]: OTHER_BYTES }) },
    ])
    const reference: AssetReference = { scope: 'project', contentHash: HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.bytes).toEqual(OTHER_BYTES)
      expect(resolution.resolvedScope).toBe('user')
    }
  })

  it('prefers the requested scope over a higher-precedence scope that also has the hash', async () => {
    const registry = new AssetRegistry([
      { kind: 'user', source: new InMemoryAssetSource('user', { [HASH]: OTHER_BYTES }) },
      { kind: 'project', source: new InMemoryAssetSource('project', { [HASH]: BYTES }) },
    ])
    const reference: AssetReference = { scope: 'project', contentHash: HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.resolvedScope).toBe('project')
    }
  })
})
