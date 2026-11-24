import { describe, expect, it } from 'vitest'
import { parseCatalogId, type CatalogId } from './catalog-id.ts'
import { matchesPredicate, parseSocketPredicate } from './socket-predicate.ts'

function idOf(text: string): CatalogId {
  const parsed = parseCatalogId(text)
  if (!parsed.ok) throw new Error(`fixture identifier is invalid: ${parsed.problem}`)
  return parsed.id
}

function predicateOf(text: string) {
  const parsed = parseSocketPredicate(text)
  if (!parsed.ok) throw new Error(`fixture predicate is invalid: ${parsed.problem}`)
  return parsed.predicate
}

describe('socket predicates', () => {
  it('a predicate matches a domain, a category, or one named asset in every version', () => {
    expect(parseSocketPredicate('HDW.*')).toEqual({ ok: true, predicate: { domain: 'HDW' } })
    expect(parseSocketPredicate('HDW.window_sash_casement/*')).toEqual({
      ok: true,
      predicate: { domain: 'HDW', subcategory: 'window_sash_casement' },
    })
    expect(parseSocketPredicate('HDW.window_sash_casement/brass_sash_lock')).toEqual({
      ok: true,
      predicate: { domain: 'HDW', subcategory: 'window_sash_casement', slug: 'brass_sash_lock' },
    })
    expect(parseSocketPredicate('FFE.seating/*').ok).toBe(true)

    const lock = idOf('core:HDW.window_sash_casement/brass_sash_lock@1.0.0')
    const otherHardware = idOf('core:HDW.door_hinge/butt_hinge@1.0.0')
    const chair = idOf('core:FFE.seating/windsor_side_chair@1.0.0')

    const domain = predicateOf('HDW.*')
    expect(matchesPredicate(domain, lock)).toBe(true)
    expect(matchesPredicate(domain, otherHardware)).toBe(true)
    expect(matchesPredicate(domain, chair)).toBe(false)

    const category = predicateOf('HDW.window_sash_casement/*')
    expect(matchesPredicate(category, lock)).toBe(true)
    expect(matchesPredicate(category, otherHardware)).toBe(false)

    const named = predicateOf('HDW.window_sash_casement/brass_sash_lock')
    expect(matchesPredicate(named, lock)).toBe(true)
    expect(
      matchesPredicate(named, idOf('core:HDW.window_sash_casement/brass_sash_lock@2.0.0')),
    ).toBe(true)
    expect(
      matchesPredicate(
        named,
        idOf('org_period-house:HDW.window_sash_casement/brass_sash_lock@2.0.0'),
      ),
    ).toBe(true)
    expect(
      matchesPredicate(named, idOf('core:HDW.window_sash_casement/iron_sash_lock@1.0.0')),
    ).toBe(false)
  })

  it('refuses a malformed predicate', () => {
    const malformed = [
      'HDW',
      'hdw.*',
      'HDW.*/*',
      'HDW.window_sash_casement',
      'HDW.window_sash_casement/brass_sash_lock@1.0.0',
      'XYZ.*',
    ]
    for (const text of malformed) {
      const result = parseSocketPredicate(text)
      expect(result.ok, text).toBe(false)
      if (!result.ok) expect(result.problem.length, text).toBeGreaterThan(0)
    }

    const unknownDomain = parseSocketPredicate('XYZ.*')
    expect(!unknownDomain.ok && unknownDomain.problem).toContain('domain')
  })
})
