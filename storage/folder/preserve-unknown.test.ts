// Extension keys are reverse-DNS namespaces (spec section 6.3), which are not
// camelCase by design. The naming-convention rule is scoped off for these
// intentionally-namespaced literal keys.
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest'
import { graftUnknown } from './preserve-unknown'

describe('graftUnknown object union', () => {
  it('re-grafts a top-level key the next document dropped, keeping next for shared keys', () => {
    const previous = { meta: { name: 'old' }, annotations: { northArrow: { angle: 12 } } }
    const next = { meta: { name: 'new' } }
    expect(graftUnknown(previous, next)).toEqual({
      meta: { name: 'new' },
      annotations: { northArrow: { angle: 12 } },
    })
  })

  it('re-grafts an unknown key nested on a shared entity object', () => {
    const previous = { meta: { name: 'p', trim: { profile: 'ogee' } } }
    const next = { meta: { name: 'p' } }
    expect(graftUnknown(previous, next)).toEqual({ meta: { name: 'p', trim: { profile: 'ogee' } } })
  })

  it('returns next unchanged when no keys were dropped', () => {
    const next = { meta: { name: 'p' }, extensions: { 'com.x.y': { a: 1 } } }
    expect(graftUnknown({ meta: { name: 'p' } }, next)).toEqual(next)
  })
})

describe('graftUnknown id-array reconciliation', () => {
  it('restores a dropped unknown sub-key on a surviving entity matched by id', () => {
    const previous = { walls: [{ id: 'w1', thickness: 100, curve: { radius: 50 } }] }
    const next = { walls: [{ id: 'w1', thickness: 120 }] }
    expect(graftUnknown(previous, next)).toEqual({
      walls: [{ id: 'w1', thickness: 120, curve: { radius: 50 } }],
    })
  })

  it('does not resurrect an array element the next document deleted', () => {
    const previous = { walls: [{ id: 'w1' }, { id: 'w2', curve: { r: 1 } }] }
    const next = { walls: [{ id: 'w1' }] }
    expect(graftUnknown(previous, next)).toEqual({ walls: [{ id: 'w1' }] })
  })

  it('passes through arrays of id-less values as next', () => {
    const previous = { customPolygon: [{ x: 0, y: 0 }] }
    const next = { customPolygon: [{ x: 1, y: 1 }] }
    expect(graftUnknown(previous, next)).toEqual({ customPolygon: [{ x: 1, y: 1 }] })
  })
})

describe('graftUnknown keyed-collection maps', () => {
  it('does not resurrect a deleted roomOverrides entry but enriches survivors', () => {
    const previous = {
      roomOverrides: { a: { name: 'A', extra: 1 }, b: { name: 'B' } },
    }
    const next = { roomOverrides: { a: { name: 'A2' } } }
    expect(graftUnknown(previous, next)).toEqual({
      roomOverrides: { a: { name: 'A2', extra: 1 } },
    })
  })

  it('treats paint the same way', () => {
    const previous = { paint: { s1: { color: 'old' }, s2: { color: 'gone' } } }
    const next = { paint: { s1: { color: 'new' } } }
    expect(graftUnknown(previous, next)).toEqual({ paint: { s1: { color: 'new' } } })
  })
})
