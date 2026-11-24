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
})
