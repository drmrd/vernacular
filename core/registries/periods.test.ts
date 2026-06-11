import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { PERIOD_REGISTRY_VERSION, builtinPeriods } from './periods'

describe('builtin periods', () => {
  it('seeds the MVP chronological periods with the registry version', () => {
    expect(builtinPeriods.version).toBe(PERIOD_REGISTRY_VERSION)

    const victorian = getEntry(builtinPeriods, 'victorian')
    expect(victorian?.displayName['en-US']).toBe('Victorian')
    expect(victorian?.approximateRange).toBe('c. 1837-1901')
  })

  it('includes the explicit unknown period for houses of uncertain date', () => {
    expect(getEntry(builtinPeriods, 'unknown')?.displayName['en-US']).toBe('Unknown')
  })
})
