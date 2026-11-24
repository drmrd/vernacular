import { describe, expect, it } from 'vitest'
import {
  categoryOf,
  formatCatalogId,
  parseCatalogId,
  RESERVED_NAMESPACE_PREFIXES,
} from './catalog-id.ts'

describe('parseCatalogId', () => {
  it('parses a catalog identifier into its five parts', () => {
    expect(parseCatalogId('core:FFE.seating/windsor_side_chair@1.0.0')).toEqual({
      ok: true,
      id: {
        namespace: 'core',
        domain: 'FFE',
        subcategory: 'seating',
        slug: 'windsor_side_chair',
        version: '1.0.0',
      },
    })

    const prerelease = parseCatalogId(
      'org_period-house:HDW.window_sash_casement/brass_sash_lock@2.1.0-rc.1',
    )
    expect(prerelease).toMatchObject({
      ok: true,
      id: {
        namespace: 'org_period-house',
        domain: 'HDW',
        subcategory: 'window_sash_casement',
        slug: 'brass_sash_lock',
        version: '2.1.0-rc.1',
      },
    })

    for (const namespace of ['usr_dana', 'pkg_parlor-set']) {
      expect(parseCatalogId(`${namespace}:FFE.seating/windsor_side_chair@1.0.0`)).toMatchObject({
        ok: true,
        id: { namespace },
      })
    }
  })

  const refusals: ReadonlyArray<readonly [string, string, RegExp]> = [
    ['an unknown domain', 'core:XYZ.seating/windsor_side_chair@1.0.0', /^domain/],
    ['a too-short subcategory', 'core:FFE.ab/windsor_side_chair@1.0.0', /^subcategory/],
    ['a too-short slug', 'core:FFE.seating/a@1.0.0', /^slug/],
    ['a capitalized slug', 'core:FFE.seating/Windsor@1.0.0', /^slug/],
    ['a two-part version', 'core:FFE.seating/windsor_side_chair@1.0', /^version/],
    ['a zero-padded version', 'core:FFE.seating/windsor_side_chair@01.0.0', /^version/],
    ['build metadata in the version', 'core:FFE.seating/windsor_side_chair@1.0.0+5', /^version/],
    ['a zero-padded prerelease', 'core:FFE.seating/windsor_side_chair@1.0.0-01', /^version/],
    ['a missing namespace', 'FFE.seating/windsor_side_chair@1.0.0', /^namespace/],
    [
      'an overlong namespace',
      `org_${'a'.repeat(32)}:FFE.seating/windsor_side_chair@1.0.0`,
      /^namespace/,
    ],
    ['a capitalized namespace', 'Org_x:FFE.seating/windsor_side_chair@1.0.0', /^namespace/],
    ['a trailing space', 'core:FFE.seating/windsor_side_chair@1.0.0 ', /^version/],
  ]

  it.each(refusals)(
    'refuses text that breaks the grammar and names the part: %s',
    (_, text, part) => {
      const parsed = parseCatalogId(text)

      expect(parsed).toMatchObject({ ok: false })
      expect(parsed.ok === false && parsed.problem).toMatch(part)
    },
  )

  const missingSeparators: ReadonlyArray<readonly [string, string, RegExp]> = [
    ['@', 'core:FFE.seating/windsor_side_chair', /^version/],
    ['/', 'core:FFE.seating', /^slug/],
    ['.', 'core:FFE', /^subcategory/],
    [':', 'core', /^domain/],
  ]

  it.each(missingSeparators)(
    'names the missing part when a separator is absent: no "%s"',
    (_, text, part) => {
      const parsed = parseCatalogId(text)

      expect(parsed).toMatchObject({ ok: false })
      expect(parsed.ok === false && parsed.problem).toMatch(part)
    },
  )

  it('checks the parts left to right before it reports a missing separator', () => {
    const cases: ReadonlyArray<readonly [string, RegExp]> = [
      ['Org_x:FFE', /^namespace/],
      ['core:XYZ.seating', /^domain/],
      ['core:FFE.Seating', /^subcategory/],
      ['core:FFE.seating/W', /^slug/],
      ['mfr_x:HDW.door_locksets_latches/rim_lock', /^namespace prefix "mfr_" is reserved/],
    ]

    for (const [text, expected] of cases) {
      const parsed = parseCatalogId(text)

      expect(parsed.ok, text).toBe(false)
      expect(parsed.ok === false && parsed.problem, text).toMatch(expected)
    }
  })

  it('refuses the reserved namespace with its own message', () => {
    const parsed = parseCatalogId('mfr_example:HDW.door_locksets_latches/rim_lock@1.0.0')

    expect(parsed).toMatchObject({ ok: false })
    expect(parsed.ok === false && parsed.problem).toMatch(/reserved/i)
    expect(parsed.ok === false && parsed.problem).toContain('mfr_')
    expect(RESERVED_NAMESPACE_PREFIXES).toEqual(['mfr_'])
  })

  it('formats an identifier to the text it was parsed from, and gives its category', () => {
    const texts = [
      'core:FFE.seating/windsor_side_chair@1.0.0',
      'org_period-house:HDW.window_sash_casement/brass_sash_lock@2.1.0-rc.1',
      'usr_dana:FFE.seating/windsor_side_chair@1.0.0',
      'pkg_parlor-set:FFE.seating/windsor_side_chair@1.0.0',
    ]

    for (const text of texts) {
      const parsed = parseCatalogId(text)

      expect(parsed.ok && formatCatalogId(parsed.id)).toBe(text)
    }

    const first = parseCatalogId(texts[0] as string)
    expect(first.ok && categoryOf(first.id)).toBe('FFE.seating')
  })

  it('does not read the category registry', () => {
    expect(parseCatalogId('core:FFE.not_in_the_registry/thing@1.0.0')).toMatchObject({
      ok: true,
      id: { subcategory: 'not_in_the_registry' },
    })
  })
})
