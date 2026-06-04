import { describe, expect, it } from 'vitest'
import { validatePackManifest } from './manifest-validation.mjs'

function validManifest() {
  return {
    packId: 'vernacular-starter',
    version: '1.0.0',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['mid-century'],
    categories: ['seating'],
    assets: [],
  }
}

describe('validatePackManifest top-level fields', () => {
  it('accepts a well-formed manifest', () => {
    expect(validatePackManifest(validManifest())).toEqual({ valid: true, errors: [] })
  })

  it('rejects a non-object manifest', () => {
    expect(validatePackManifest(null).valid).toBe(false)
  })

  it('reports each missing required top-level field', () => {
    const result = validatePackManifest({ assets: [] })

    expect(result.valid).toBe(false)
    for (const field of ['packId', 'version', 'license', 'attribution']) {
      expect(result.errors.some((message) => message.includes(field))).toBe(true)
    }
  })

  it('rejects a version that is not SemVer', () => {
    const result = validatePackManifest({ ...validManifest(), version: 'v1' })

    expect(result.valid).toBe(false)
    expect(result.errors.some((message) => message.includes('version'))).toBe(true)
  })
})
