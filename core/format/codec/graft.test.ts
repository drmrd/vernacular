// Extension keys are reverse-DNS namespaces (spec section 6.3), which are not
// camelCase by design. The naming-convention rule is scoped off for these
// intentionally-namespaced literal keys.
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest'
import {
  KNOWN_KEYS,
  KNOWN_ROOT_TYPE,
  createEmptyProject,
  type KnownKeyTable,
  type KnownValue,
} from '../../index'
import { graftUnknown, graftWithTable, preserveUnknown } from './graft'

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

  it('replaces a paint entry outright when its treatment kind changes, not grafting fields from the old kind', () => {
    const previous = {
      paint: { s1: { kind: 'solid', color: 'old-red', finishId: 'matte' } },
    }
    const next = {
      paint: {
        s1: { kind: 'pattern', patternId: 'herringbone', scale: 100, colors: ['blue', 'white'] },
      },
    }
    expect(graftUnknown(previous, next)).toEqual(next)
  })
})

const UNKNOWN_KEY = 'keyFromANewerBuild'

function objectAt(type: string): KnownValue {
  return { kind: 'object', type }
}

const typeNames = Object.keys(KNOWN_KEYS)
const optionalKeys = typeNames.flatMap((typeName) =>
  KNOWN_KEYS[typeName]!.optional.map((key): [string, string] => [typeName, key]),
)

describe('graftWithTable known optional keys', () => {
  it('generates its cases from a non-empty table of known keys', () => {
    expect(typeNames.length).toBeGreaterThan(0)
    expect(optionalKeys.length).toBeGreaterThan(0)
  })

  it.each(optionalKeys)(
    'leaves the optional key of %s cleared when the next object lacks %s',
    (typeName, key) => {
      const previous = { [key]: 'value from the previous file' }
      const grafted = graftWithTable(previous, {}, { table: KNOWN_KEYS, at: objectAt(typeName) })
      expect(grafted).toEqual({})
    },
  )

  it('leaves a cleared project style cleared while it keeps the rest of the next document', () => {
    const previous = { meta: { name: 'old', style: { styleId: 'craftsman' } } }
    const next = { meta: { name: 'new' } }
    const grafted = graftWithTable(previous, next, {
      table: KNOWN_KEYS,
      at: objectAt(KNOWN_ROOT_TYPE),
    })
    expect(grafted).toEqual({ meta: { name: 'new' } })
  })

  it('leaves a cleared period override cleared on a floor matched by id', () => {
    const previous = { floors: [{ id: 'f1', name: 'Ground', periodOverride: 'victorian' }] }
    const next = { floors: [{ id: 'f1', name: 'Ground' }] }
    const grafted = graftWithTable(previous, next, {
      table: KNOWN_KEYS,
      at: objectAt(KNOWN_ROOT_TYPE),
    })
    expect(grafted).toEqual({ floors: [{ id: 'f1', name: 'Ground' }] })
  })
})

describe('graftWithTable unknown keys', () => {
  it.each(typeNames)('keeps an unknown key of the previous %s object', (typeName) => {
    const previous = { [UNKNOWN_KEY]: { depth: { value: 1 } } }
    const grafted = graftWithTable(previous, {}, { table: KNOWN_KEYS, at: objectAt(typeName) })
    expect(grafted).toEqual(previous)
  })

  it('keeps an unknown key on an entity matched by id deep inside the document', () => {
    const previous = { floors: [{ id: 'f1', name: 'Ground', [UNKNOWN_KEY]: 'kept' }] }
    const next = { floors: [{ id: 'f1', name: 'Renamed' }] }
    const grafted = graftWithTable(previous, next, {
      table: KNOWN_KEYS,
      at: objectAt(KNOWN_ROOT_TYPE),
    })
    expect(grafted).toEqual({ floors: [{ id: 'f1', name: 'Renamed', [UNKNOWN_KEY]: 'kept' }] })
  })

  it('restores a previous-only nested key inside the value of an unknown key', () => {
    const table: KnownKeyTable = { Thing: { keys: { id: { kind: 'leaf' } }, optional: [] } }
    const previous = { id: 't', [UNKNOWN_KEY]: { kept: 1, replaced: 'old', inner: { deep: 2 } } }
    const next = { id: 't', [UNKNOWN_KEY]: { replaced: 'new', inner: {} } }
    const grafted = graftWithTable(previous, next, { table, at: objectAt('Thing') })
    expect(grafted).toEqual({
      id: 't',
      [UNKNOWN_KEY]: { kept: 1, replaced: 'new', inner: { deep: 2 } },
    })
  })
})

describe('graftWithTable array items without an id', () => {
  it('takes each item from the next document as it is', () => {
    const table: KnownKeyTable = {
      Shape: { keys: { points: { kind: 'array', item: objectAt('Point') } }, optional: [] },
      Point: { keys: { x: { kind: 'leaf' }, y: { kind: 'leaf' } }, optional: ['y'] },
    }
    const previous = { points: [{ x: 0, y: 5, [UNKNOWN_KEY]: true }] }
    const next = { points: [{ x: 1 }] }
    const grafted = graftWithTable(previous, next, { table, at: objectAt('Shape') })
    expect(grafted).toEqual({ points: [{ x: 1 }] })
  })
})

const INHERITED_NAMES: ReadonlyArray<[string, unknown]> = [
  ['constructor', { depth: { value: 1 } }],
  ['toString', { depth: { value: 1 } }],
  ['hasOwnProperty', 1],
  ['valueOf', 1],
]

describe('graftWithTable unknown keys named like inherited properties', () => {
  it.each(INHERITED_NAMES)('keeps an unknown root key named %s', (name, value) => {
    const previous = { meta: { name: 'old' }, [name]: value }
    const next = { meta: { name: 'new' } }
    const grafted = graftWithTable(previous, next, {
      table: KNOWN_KEYS,
      at: objectAt(KNOWN_ROOT_TYPE),
    })
    expect(grafted).toEqual({ meta: { name: 'new' }, [name]: value })
  })

  it.each(INHERITED_NAMES)('keeps an unknown key named %s on a floor', (name, value) => {
    const previous = { floors: [{ id: 'f1', name: 'Ground', [name]: value }] }
    const next = { floors: [{ id: 'f1', name: 'Ground' }] }
    const grafted = graftWithTable(previous, next, {
      table: KNOWN_KEYS,
      at: objectAt(KNOWN_ROOT_TYPE),
    })
    expect(grafted).toEqual({ floors: [{ id: 'f1', name: 'Ground', [name]: value }] })
  })
})

const PROTO_VALUE = { fromANewerBuild: true }
const PREVIOUS_WITH_PROTO_KEY = '{"__proto__":{"fromANewerBuild":true},"meta":{"name":"old"}}'

function expectProtoKeyKept(result: unknown): void {
  const grafted = result as Record<string, unknown>
  expect(Object.hasOwn(grafted, '__proto__')).toBe(true)
  expect(Object.getOwnPropertyDescriptor(grafted, '__proto__')?.value).toEqual(PROTO_VALUE)
  expect(Object.getPrototypeOf(grafted)).toBe(Object.prototype)
  expect(JSON.stringify(grafted)).toContain('"__proto__":{"fromANewerBuild":true}')
}

describe('graftWithTable unknown key named __proto__', () => {
  it('keeps the own key without changing the prototype of the result', () => {
    const previous: unknown = JSON.parse(PREVIOUS_WITH_PROTO_KEY)
    const next = { meta: { name: 'new' } }
    const grafted = graftWithTable(previous, next, {
      table: KNOWN_KEYS,
      at: objectAt(KNOWN_ROOT_TYPE),
    })
    expectProtoKeyKept(grafted)
  })
})

describe('preserveUnknown at the root', () => {
  const project = createEmptyProject({
    name: 'P',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })

  it('keeps an unknown root key named toString', () => {
    const previous = { ...JSON.parse(JSON.stringify(project)), toString: { depth: { value: 1 } } }
    const saved = preserveUnknown(previous, project) as unknown as Record<string, unknown>
    expect(Object.hasOwn(saved, 'toString')).toBe(true)
    expect(saved['toString']).toEqual({ depth: { value: 1 } })
  })

  it('keeps an unknown root key named __proto__ as an own key', () => {
    const previous: unknown = JSON.parse(PREVIOUS_WITH_PROTO_KEY)
    expectProtoKeyKept(preserveUnknown(previous, project))
  })
})
