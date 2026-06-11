// Extension keys are reverse-DNS namespaces (spec section 6.3), not camelCase by design; the
// naming-convention rule is scoped off for these intentionally-namespaced literal keys.
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest'
import {
  createStrictValidator,
  isReverseDnsNamespace,
  type ExtensionSchemaRegistry,
} from './strict-profile'

const coreSchema = {
  type: 'object',
  properties: { meta: { type: 'object' }, extensions: { type: 'object' } },
  required: ['meta'],
  additionalProperties: true,
}
const registry: ExtensionSchemaRegistry = new Map([
  [
    'com.example.solar',
    { type: 'object', properties: { kw: { type: 'number' } }, required: ['kw'] },
  ],
])

describe('createStrictValidator registered namespaces', () => {
  it('accepts a conforming registered namespace payload', () => {
    const validate = createStrictValidator(coreSchema, registry)
    expect(validate({ meta: {}, extensions: { 'com.example.solar': { kw: 6 } } }).valid).toBe(true)
  })

  it('rejects a registered namespace payload that violates its schema', () => {
    const validate = createStrictValidator(coreSchema, registry)
    expect(validate({ meta: {}, extensions: { 'com.example.solar': { kw: 'lots' } } }).valid).toBe(
      false,
    )
  })

  it('accepts an unregistered namespace payload (open format)', () => {
    const validate = createStrictValidator(coreSchema, registry)
    expect(
      validate({ meta: {}, extensions: { 'org.other.thing': { whatever: true } } }).valid,
    ).toBe(true)
  })

  it('validates a registered namespace on a nested entity (a wall)', () => {
    const validate = createStrictValidator(coreSchema, registry)
    const document = {
      meta: {},
      floors: [
        { id: 'f1', walls: [{ id: 'w1', extensions: { 'com.example.solar': { kw: 'no' } } }] },
      ],
    }
    expect(validate(document).valid).toBe(false)
  })
})

describe('reverse-DNS namespace keys', () => {
  it('accepts a well-formed reverse-DNS key', () => {
    expect(isReverseDnsNamespace('com.example.solar')).toBe(true)
  })

  it('rejects a key without a dot', () => {
    expect(isReverseDnsNamespace('solar')).toBe(false)
  })

  it('reports a malformed namespace key under the strict profile', () => {
    const validate = createStrictValidator(coreSchema, new Map())
    expect(validate({ meta: {}, extensions: { solar: { kw: 6 } } }).valid).toBe(false)
  })
})
