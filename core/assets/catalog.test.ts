import { describe, expect, it } from 'vitest'
import { validateCatalog } from './catalog.ts'

const SCHEMA_ADDRESS = 'https://drmrd.github.io/vernacular/schema/catalog/1/catalog.schema.json'
const NEWER_CATALOG_VERSION = 2

function specificationCatalog(): Record<string, unknown> {
  return {
    $schema: SCHEMA_ADDRESS,
    catalogVersion: 1,
    name: 'Vernacular',
    packs: [
      {
        packId: 'vernacular-starter',
        version: '1.1.0',
        formatVersion: 2,
        manifest: {
          sha256: '5b1f0c9e7a3d4c2b8e6f1a0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b',
          byteLength: 1836,
        },
        byteLength: 412672,
        itemCount: 2,
      },
      {
        packId: 'vernacular-starter',
        version: '1.0.0',
        formatVersion: 1,
        manifest: {
          sha256: '36275a9822b56a305e4fe4127b751ca382328ff29f4290edb00be28fc2af4b37',
          byteLength: 663,
        },
        byteLength: 53,
        itemCount: 1,
      },
    ],
  }
}

function withFirstPack(change: (pack: Record<string, unknown>) => void): Record<string, unknown> {
  const catalog = specificationCatalog()
  const [first] = catalog.packs as Record<string, unknown>[]
  if (!first) throw new Error('the specification catalog has no first pack')
  change(first)
  return catalog
}

function errorsOf(value: unknown): string[] {
  const result = validateCatalog(value)
  if (result.outcome !== 'invalid') throw new Error(`expected invalid, got ${result.outcome}`)
  return result.errors
}

describe('validateCatalog', () => {
  it('validates the catalog of the specification and tells a newer catalog version from an invalid file', () => {
    const result = validateCatalog(specificationCatalog())

    expect(result.outcome).toBe('valid')
    if (result.outcome !== 'valid') return
    expect(result.catalog.packs).toHaveLength(2)
    const first = result.catalog.packs[0]
    expect(first?.formatVersion).toBe(2)
    expect(first?.manifest.byteLength).toBe(1836)
  })

  it('tells a newer catalog version from an invalid file', () => {
    const newer = { ...specificationCatalog(), catalogVersion: NEWER_CATALOG_VERSION }

    expect(validateCatalog(newer)).toEqual({ outcome: 'newer-version' })
  })

  it('accepts a catalog with no $schema and no name, and ignores unknown fields', () => {
    const bare = specificationCatalog()
    delete bare.$schema
    delete bare.name

    expect(validateCatalog({ ...bare, futureField: true }).outcome).toBe('valid')
  })

  it.each([
    ['no packs', /^packs/, () => ({ catalogVersion: 1 })],
    [
      'a hash of 63 characters',
      /^packs\[0\]\.manifest\.sha256/,
      () => withFirstPack((pack) => (pack.manifest = { sha256: 'a'.repeat(63), byteLength: 1836 })),
    ],
    [
      'an upper-case hash',
      /^packs\[0\]\.manifest\.sha256/,
      () => withFirstPack((pack) => (pack.manifest = { sha256: 'A'.repeat(64), byteLength: 1836 })),
    ],
    [
      'a negative byteLength',
      /^packs\[0\]\.byteLength/,
      () => withFirstPack((pack) => (pack.byteLength = -1)),
    ],
    [
      'an itemCount of 1.5',
      /^packs\[0\]\.itemCount/,
      () => withFirstPack((pack) => (pack.itemCount = 1.5)),
    ],
    [
      'no formatVersion',
      /^packs\[0\]\.formatVersion/,
      () => withFirstPack((pack) => delete pack.formatVersion),
    ],
  ])('reports exactly one error naming the path for %s', (_case, path, build) => {
    const errors = errorsOf(build())

    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(path)
  })

  it("refuses a malformed pack entry with one error each and checks every field's type", () => {
    const HEX_DIGEST = 'a'.repeat(64)
    const withManifest = (manifest: unknown): Record<string, unknown> =>
      withFirstPack((pack) => (pack.manifest = manifest))
    const withField = (field: string, value: unknown): Record<string, unknown> =>
      withFirstPack((pack) => (pack[field] = value))
    const cases: [string, RegExp, Record<string, unknown>][] = [
      ['version 1.1', /^packs\[0\]\.version/, withField('version', '1.1')],
      ['version v1.0.0', /^packs\[0\]\.version/, withField('version', 'v1.0.0')],
      ['a numeric version', /^packs\[0\]\.version/, withField('version', 1)],
      ['an empty packId', /^packs\[0\]\.packId/, withField('packId', '')],
      ['a numeric packId', /^packs\[0\]\.packId/, withField('packId', 7)],
      ['a formatVersion of 0', /^packs\[0\]\.formatVersion/, withField('formatVersion', 0)],
      ['a numeric entry', /^packs\[0\]/, { catalogVersion: 1, packs: [5] }],
      ['a null entry', /^packs\[0\]/, { catalogVersion: 1, packs: [null] }],
      ['a string manifest', /^packs\[0\]\.manifest/, withManifest('abc')],
      [
        'an empty manifest file',
        /^packs\[0\]\.manifest\.byteLength/,
        withManifest({ sha256: HEX_DIGEST, byteLength: 0 }),
      ],
      [
        'a hash with a non-hex prefix',
        /^packs\[0\]\.manifest\.sha256/,
        withManifest({ sha256: `x${HEX_DIGEST}`, byteLength: 1836 }),
      ],
      [
        'a hash with a non-hex suffix',
        /^packs\[0\]\.manifest\.sha256/,
        withManifest({ sha256: `${HEX_DIGEST}x`, byteLength: 1836 }),
      ],
      ['a numeric name', /^name/, { ...specificationCatalog(), name: 3 }],
      ['a numeric $schema', /^\$schema/, { ...specificationCatalog(), $schema: 3 }],
    ]

    for (const [label, path, catalog] of cases) {
      const errors = errorsOf(catalog)
      expect(errors, label).toHaveLength(1)
      expect(errors[0], label).toMatch(path)
    }
  })
})

describe('validateCatalog - pack versions and non-object values', () => {
  it('accepts every strict version form and an empty pack entry length', () => {
    const versions = ['1.0.0-alpha.1', '10.20.30', '1.0.0-0.3.7', '1.0.0-x-y.z']
    for (const version of versions) {
      const catalog = withFirstPack((pack) => (pack.version = version))
      expect(validateCatalog(catalog).outcome, version).toBe('valid')
    }
    expect(validateCatalog(withFirstPack((pack) => (pack.byteLength = 0))).outcome).toBe('valid')
  })

  it.each([
    '1.0.0+build.5',
    '01.0.0',
    '1.00.0',
    '1.0.0-01',
    '1.0.0-a..b',
    '1.0.0+',
    '1.0.0x',
    ' 1.0.0',
  ])('refuses the pack version %j with one error naming the version', (version) => {
    const errors = errorsOf(withFirstPack((pack) => (pack.version = version)))

    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^packs\[0\]\.version/)
  })

  it('refuses an array as a pack entry or as a manifest with one error each', () => {
    const asEntry = errorsOf({ catalogVersion: 1, packs: [[]] })
    const asManifest = errorsOf(withFirstPack((pack) => (pack.manifest = [])))

    expect(asEntry).toHaveLength(1)
    expect(asEntry[0]).toMatch(/^packs\[0\]/)
    expect(asManifest).toHaveLength(1)
    expect(asManifest[0]).toMatch(/^packs\[0\]\.manifest/)
  })

  it.each([null, 'text', []])(
    'refuses the non-object catalog %j with one error naming catalog',
    (value) => {
      const errors = errorsOf(value)

      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/^catalog/)
    },
  )
})
