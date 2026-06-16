import { describe, expect, it } from 'vitest'
import { ASSET_KINDS, validatePackManifest } from './manifest-validation.mjs'

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

function validAsset() {
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

describe('validatePackManifest assets', () => {
  it('exposes the asset kinds from the specification', () => {
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

  it('rejects an assets field that is not an array', () => {
    const result = validatePackManifest({ ...validManifest(), assets: {} })

    expect(result.errors.some((message) => message.includes('assets must be an array'))).toBe(true)
  })

  it('flags a missing content hash, name, license, and unknown kind', () => {
    const broken = { kind: 'spaceship', dimensions: { width: 1, depth: 1, height: 1 } }
    const result = validatePackManifest({ ...validManifest(), assets: [broken] })

    expect(result.valid).toBe(false)
    for (const fragment of ['contentHash', 'name', 'license', 'kind']) {
      expect(result.errors.some((message) => message.includes(fragment))).toBe(true)
    }
  })

  it('accepts a well-formed asset', () => {
    const result = validatePackManifest({ ...validManifest(), assets: [validAsset()] })

    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('requires attribution on each asset', () => {
    const asset = { ...validAsset() }
    delete asset.attribution
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })

    expect(result.valid).toBe(false)
    expect(result.errors.some((message) => message.includes('attribution'))).toBe(true)
  })
})

describe('validatePackManifest asset eras', () => {
  function assetWithEras(eras) {
    return { ...validAsset(), eras }
  }

  function assetWithoutEras() {
    const asset = { ...validAsset(), eras: ['mid-century'] }
    delete asset.eras
    return asset
  }

  it('rejects an asset whose eras is missing, empty, or not a string array', () => {
    const invalidCases = [
      assetWithoutEras(),
      assetWithEras([]),
      assetWithEras(['']),
      assetWithEras('mid-century'),
    ]

    for (const asset of invalidCases) {
      const result = validatePackManifest({ ...validManifest(), assets: [asset] })

      expect(result.valid).toBe(false)
      expect(result.errors.some((message) => message.includes('eras'))).toBe(true)
    }
  })

  it('accepts an asset with a non-empty eras list', () => {
    const result = validatePackManifest({
      ...validManifest(),
      assets: [assetWithEras(['mid-century'])],
    })

    expect(result).toEqual({ valid: true, errors: [] })
  })
})

describe('validatePackManifest asset categories', () => {
  function assetWithCategories(categories) {
    return { ...validAsset(), categories }
  }

  function assetWithoutCategories() {
    const asset = { ...validAsset(), categories: ['seating'] }
    delete asset.categories
    return asset
  }

  it('rejects an asset whose categories is missing, empty, or not a string array', () => {
    const invalidCases = [
      assetWithoutCategories(),
      assetWithCategories([]),
      assetWithCategories(['']),
      assetWithCategories('seating'),
    ]

    for (const asset of invalidCases) {
      const result = validatePackManifest({ ...validManifest(), assets: [asset] })

      expect(result.valid).toBe(false)
      expect(result.errors.some((message) => message.includes('categories'))).toBe(true)
    }
  })

  it('accepts an asset with a non-empty categories list', () => {
    const result = validatePackManifest({
      ...validManifest(),
      assets: [assetWithCategories(['seating'])],
    })

    expect(result).toEqual({ valid: true, errors: [] })
  })
})

describe('validatePackManifest asset sourceUrl', () => {
  it('accepts an asset with no sourceUrl', () => {
    const result = validatePackManifest({ ...validManifest(), assets: [validAsset()] })

    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('accepts an asset whose sourceUrl is an http(s) URL', () => {
    const asset = { ...validAsset(), sourceUrl: 'https://example.org/chair' }
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })

    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('rejects an asset whose sourceUrl is not a valid URL', () => {
    const invalidCases = [
      { ...validAsset(), sourceUrl: 'not a url' },
      { ...validAsset(), sourceUrl: 42 },
    ]

    for (const asset of invalidCases) {
      const result = validatePackManifest({ ...validManifest(), assets: [asset] })

      expect(result.valid).toBe(false)
      expect(result.errors.some((message) => message.includes('sourceUrl'))).toBe(true)
    }
  })
})

describe('validatePackManifest pack-level eras and categories', () => {
  it('rejects a manifest with no pack-level eras', () => {
    const manifest = { ...validManifest() }
    delete manifest.eras
    const result = validatePackManifest(manifest)

    expect(result.valid).toBe(false)
    expect(result.errors.some((message) => message.includes('eras'))).toBe(true)
  })

  it('rejects a manifest with no pack-level categories', () => {
    const manifest = { ...validManifest() }
    delete manifest.categories
    const result = validatePackManifest(manifest)

    expect(result.valid).toBe(false)
    expect(result.errors.some((message) => message.includes('categories'))).toBe(true)
  })
})

describe('validatePackManifest dimensions', () => {
  it('requires a dimensions object on each asset', () => {
    const asset = { ...validAsset() }
    delete asset.dimensions
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })

    expect(result.errors.some((message) => message.includes('dimensions'))).toBe(true)
  })

  it('rejects non-positive, non-finite, and absurdly large dimensions', () => {
    const cases = [
      { width: 0, depth: 10, height: 10 },
      { width: 10, depth: -5, height: 10 },
      { width: 10, depth: 10, height: Number.POSITIVE_INFINITY },
      { width: 10, depth: 10, height: 1_000_000 },
    ]

    for (const dimensions of cases) {
      const result = validatePackManifest({
        ...validManifest(),
        assets: [{ ...validAsset(), dimensions }],
      })
      expect(result.valid).toBe(false)
    }
  })
})
