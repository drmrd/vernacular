import { describe, expect, it } from 'vitest'
import { parseCatalogId } from './catalog-id.ts'

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
    ['an unknown domain', 'core:XYZ.seating/windsor_side_chair@1.0.0', /domain/i],
    ['a too-short subcategory', 'core:FFE.ab/windsor_side_chair@1.0.0', /subcategory/i],
    ['a too-short slug', 'core:FFE.seating/a@1.0.0', /slug/i],
    ['a capitalized slug', 'core:FFE.seating/Windsor@1.0.0', /slug/i],
    ['a two-part version', 'core:FFE.seating/windsor_side_chair@1.0', /version/i],
    ['a zero-padded version', 'core:FFE.seating/windsor_side_chair@01.0.0', /version/i],
    ['build metadata in the version', 'core:FFE.seating/windsor_side_chair@1.0.0+5', /version/i],
    ['a zero-padded prerelease', 'core:FFE.seating/windsor_side_chair@1.0.0-01', /version/i],
    ['a missing namespace', 'FFE.seating/windsor_side_chair@1.0.0', /namespace/i],
    [
      'an overlong namespace',
      `org_${'a'.repeat(32)}:FFE.seating/windsor_side_chair@1.0.0`,
      /namespace/i,
    ],
    ['a capitalized namespace', 'Org_x:FFE.seating/windsor_side_chair@1.0.0', /namespace/i],
    ['a trailing space', 'core:FFE.seating/windsor_side_chair@1.0.0 ', /version/i],
  ]

  it.each(refusals)(
    'refuses text that breaks the grammar and names the part: %s',
    (_, text, part) => {
      const parsed = parseCatalogId(text)

      expect(parsed).toMatchObject({ ok: false })
      expect(parsed.ok === false && parsed.problem).toMatch(part)
    },
  )
})
