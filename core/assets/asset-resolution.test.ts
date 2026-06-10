import { describe, expect, it } from 'vitest'
import type { AssetReference } from '../model/asset-reference'
import {
  SCOPE_PRECEDENCE,
  orderScopesByPrecedence,
  resolvedAsset,
  missingAsset,
} from './asset-resolution'

describe('asset resolution policy', () => {
  it('orders scopes user before project before pack before bundled', () => {
    expect(SCOPE_PRECEDENCE).toEqual(['user', 'project', 'pack', 'bundled'])
  })

  it('orders a mixed scope-kind list by precedence, requested scope first', () => {
    const requested: AssetReference = { scope: 'project', contentHash: 'abc' }
    const ordered = orderScopesByPrecedence(requested, ['pack', 'user', 'project'])
    expect(ordered).toEqual(['project', 'user', 'pack'])
  })

  it('builds a resolved outcome carrying the bytes and the scope they came from', () => {
    const bytes = Uint8Array.of(1, 2, 3)
    const resolution = resolvedAsset(bytes, 'user')
    expect(resolution).toEqual({ outcome: 'resolved', bytes, resolvedScope: 'user' })
  })

  it('builds a labeled missing outcome carrying the reference and footprint', () => {
    const reference: AssetReference = { scope: 'pack:victorian@1.2.0', contentHash: 'def' }
    const footprint = { width: 600, depth: 400, height: 900 }
    const resolution = missingAsset(reference, footprint)
    expect(resolution).toEqual({
      outcome: 'missing',
      label: 'Missing asset (pack:victorian@1.2.0)',
      reference,
      footprint,
    })
  })

  it('builds a missing outcome with no footprint when none is known', () => {
    const reference: AssetReference = { scope: 'user', contentHash: 'ghi' }
    const resolution = missingAsset(reference)
    expect(resolution).toEqual({ outcome: 'missing', label: 'Missing asset (user)', reference })
    expect(resolution.footprint).toBeUndefined()
  })
})
