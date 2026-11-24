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
})
