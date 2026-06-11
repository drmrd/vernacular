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
