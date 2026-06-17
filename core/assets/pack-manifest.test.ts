import { describe, expect, it } from 'vitest'
import { ASSET_KINDS, validatePackManifest } from './pack-manifest'

function validManifest(): Record<string, unknown> {
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

function validAsset(): Record<string, unknown> {
  return {
    contentHash: '0'.repeat(64),
    name: 'Example chair',
    kind: 'furniture',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['mid-century'],
    categories: ['seating'],
    dimensions: { width: 500, depth: 520, height: 800 },
  }
}

describe('ASSET_KINDS', () => {
  it('lists all nine asset kinds in canonical order', () => {
    expect(ASSET_KINDS).toEqual([
      'furniture',
      'architectural-element',
      'trim-profile',
      'stair-component',
      'material',
      'texture',
      'underlay-image',
      'palette',
      'preview-only',
    ])
  })
})

function withoutKey(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...obj }
  delete copy[key]
  return copy
}

describe('validatePackManifest - top-level fields', () => {
  it('accepts a fully valid manifest', () => {
    expect(validatePackManifest(validManifest())).toEqual({ valid: true, errors: [] })
  })

  it('rejects null', () => {
    expect(validatePackManifest(null).valid).toBe(false)
  })

  it('reports missing top-level required fields', () => {
    const result = validatePackManifest({ assets: [] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('packId')
    expect(result.errors.join(' ')).toContain('version')
    expect(result.errors.join(' ')).toContain('license')
    expect(result.errors.join(' ')).toContain('attribution')
  })

  it('rejects a non-semver version string', () => {
    const manifest = { ...validManifest(), version: 'v1' }
    const result = validatePackManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('version')
  })

  it('rejects a manifest missing eras', () => {
    const result = validatePackManifest(withoutKey(validManifest(), 'eras'))
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('eras')
  })

  it('rejects a manifest missing categories', () => {
    const result = validatePackManifest(withoutKey(validManifest(), 'categories'))
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('categories')
  })
})

describe('validatePackManifest - assets array', () => {
  it('rejects assets that is not an array', () => {
    const manifest = { ...validManifest(), assets: {} }
    const result = validatePackManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('assets must be an array')
  })

  it('accepts a manifest with a valid asset', () => {
    const manifest = { ...validManifest(), assets: [validAsset()] }
    expect(validatePackManifest(manifest)).toEqual({ valid: true, errors: [] })
  })

  it('rejects an asset with an unknown kind and missing required fields', () => {
    const asset = { kind: 'spaceship', dimensions: { width: 1, depth: 1, height: 1 } }
    const manifest = { ...validManifest(), assets: [asset] }
    const result = validatePackManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('contentHash')
    expect(result.errors.join(' ')).toContain('name')
    expect(result.errors.join(' ')).toContain('license')
    expect(result.errors.join(' ')).toContain('kind')
  })

  it('rejects an asset missing attribution', () => {
    const manifest = { ...validManifest(), assets: [withoutKey(validAsset(), 'attribution')] }
    const result = validatePackManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('attribution')
  })

  it('rejects an asset missing dimensions', () => {
    const manifest = { ...validManifest(), assets: [withoutKey(validAsset(), 'dimensions')] }
    const result = validatePackManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('dimensions')
  })
})

describe('validatePackManifest - asset eras', () => {
  it('rejects an asset missing eras', () => {
    const result = validatePackManifest({
      ...validManifest(),
      assets: [withoutKey(validAsset(), 'eras')],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('eras')
  })

  it('rejects an asset with an empty eras array', () => {
    const asset = { ...validAsset(), eras: [] }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('eras')
  })

  it('rejects an asset with an eras entry that is an empty string', () => {
    const asset = { ...validAsset(), eras: [''] }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('eras')
  })

  it('rejects eras as a plain string instead of an array', () => {
    const asset = { ...validAsset(), eras: 'mid-century' }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('eras')
  })

  it('accepts an asset with a non-empty eras array', () => {
    const asset = { ...validAsset(), eras: ['edwardian'] }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result).toEqual({ valid: true, errors: [] })
  })
})

describe('validatePackManifest - asset categories', () => {
  it('rejects an asset missing categories', () => {
    const result = validatePackManifest({
      ...validManifest(),
      assets: [withoutKey(validAsset(), 'categories')],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('categories')
  })

  it('rejects an asset with an empty categories array', () => {
    const asset = { ...validAsset(), categories: [] }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('categories')
  })

  it('rejects an asset with a categories entry that is an empty string', () => {
    const asset = { ...validAsset(), categories: [''] }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('categories')
  })

  it('rejects categories as a plain string instead of an array', () => {
    const asset = { ...validAsset(), categories: 'seating' }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('categories')
  })

  it('accepts an asset with a non-empty categories array', () => {
    const asset = { ...validAsset(), categories: ['lighting'] }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result).toEqual({ valid: true, errors: [] })
  })
})

describe('validatePackManifest - asset sourceUrl', () => {
  it('accepts an asset with no sourceUrl', () => {
    expect(validatePackManifest({ ...validManifest(), assets: [validAsset()] })).toEqual({
      valid: true,
      errors: [],
    })
  })

  it('accepts an asset with a valid https sourceUrl', () => {
    const asset = { ...validAsset(), sourceUrl: 'https://example.org/chair' }
    expect(validatePackManifest({ ...validManifest(), assets: [asset] })).toEqual({
      valid: true,
      errors: [],
    })
  })

  it('rejects an asset with a non-URL sourceUrl string', () => {
    const asset = { ...validAsset(), sourceUrl: 'not a url' }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('sourceUrl')
  })

  it('rejects an asset with a numeric sourceUrl', () => {
    const asset = { ...validAsset(), sourceUrl: 42 }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('sourceUrl')
  })
})

describe('validatePackManifest - license policy (delegated)', () => {
  it('rejects an asset license that is not a recognized open license', () => {
    const asset = { ...validAsset(), license: 'Weird-1.0' }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('not a recognized')
  })

  it('rejects an asset license that forbids redistribution', () => {
    const asset = { ...validAsset(), license: 'CC-BY-NC-4.0' }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('forbids redistribution')
  })

  it('rejects a pack-level license that is not a recognized open license', () => {
    const manifest = { ...validManifest(), license: 'Weird-1.0' }
    const result = validatePackManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('not a recognized')
  })

  it('accepts recognized licenses at both pack and asset level', () => {
    const asset = { ...validAsset(), license: 'MIT' }
    const manifest = { ...validManifest(), license: 'MIT', assets: [asset] }
    expect(validatePackManifest(manifest)).toEqual({ valid: true, errors: [] })
  })
})

describe('validatePackManifest - asset dimensions', () => {
  it('rejects dimensions with a zero width', () => {
    const asset = { ...validAsset(), dimensions: { width: 0, depth: 520, height: 800 } }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
  })

  it('rejects dimensions with a negative depth', () => {
    const asset = { ...validAsset(), dimensions: { width: 500, depth: -5, height: 800 } }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
  })

  it('rejects dimensions with an infinite height', () => {
    const asset = {
      ...validAsset(),
      dimensions: { width: 500, depth: 520, height: Number.POSITIVE_INFINITY },
    }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
  })

  it('rejects dimensions with an unreasonably large height', () => {
    const asset = { ...validAsset(), dimensions: { width: 500, depth: 520, height: 1_000_000 } }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })
    expect(result.valid).toBe(false)
  })
})
