import { describe, expect, it } from 'vitest'
import { formatAssetReference, parseAssetReference, type AssetReference } from './asset-reference'

describe('asset references', () => {
  it('round-trips a pack-scoped reference', () => {
    const reference: AssetReference = { scope: 'pack:victorian@1.2.0', contentHash: 'abc123' }
    expect(parseAssetReference(formatAssetReference(reference))).toEqual(reference)
  })

  it('round-trips a user-scoped reference', () => {
    const reference: AssetReference = { scope: 'user', contentHash: 'deadbeef' }
    expect(parseAssetReference(formatAssetReference(reference))).toEqual(reference)
  })

  it('round-trips a project-scoped reference', () => {
    const reference: AssetReference = { scope: 'project', contentHash: 'deadbeef' }
    expect(parseAssetReference(formatAssetReference(reference))).toEqual(reference)
  })

  it('throws on a malformed serialized reference', () => {
    expect(() => parseAssetReference('no-separator-here')).toThrow('Malformed asset reference')
  })
})
