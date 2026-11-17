// Extension keys are reverse-DNS namespaces (spec section 6.3), which are not
// camelCase by design. The naming-convention rule is scoped off for these
// intentionally-namespaced literal keys.
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest'
import { KNOWN_KEYS, KNOWN_ROOT_TYPE, type KnownKeyTable, type KnownValue } from '../../index'
import { graftWithTable } from './graft'

function objectAt(type: string): KnownValue {
  return { kind: 'object', type }
}

function graftDocument(previous: unknown, next: unknown): unknown {
  return graftWithTable(previous, next, { table: KNOWN_KEYS, at: objectAt(KNOWN_ROOT_TYPE) })
}

describe('graftWithTable typed maps of the real document', () => {
  it('leaves a deleted roomOverrides entry deleted and keeps an unknown key on a survivor', () => {
    const previous = {
      roomOverrides: { a: { name: 'A', fromANewerBuild: 1 }, b: { name: 'B' } },
    }
    const next = { roomOverrides: { a: { name: 'A2' } } }
    expect(graftDocument(previous, next)).toEqual({
      roomOverrides: { a: { name: 'A2', fromANewerBuild: 1 } },
    })
  })

  it('leaves a deleted paint entry deleted', () => {
    const previous = {
      paint: { s1: { kind: 'solid', color: 'old' }, s2: { kind: 'solid', color: 'gone' } },
    }
    const next = { paint: { s1: { kind: 'solid', color: 'new' } } }
    expect(graftDocument(previous, next)).toEqual({
      paint: { s1: { kind: 'solid', color: 'new' } },
    })
  })

  it('leaves a deleted registryVersions entry deleted', () => {
    const previous = { meta: { name: 'p', registryVersions: { walls: 1, stairs: 2 } } }
    const next = { meta: { name: 'p', registryVersions: { walls: 1 } } }
    expect(graftDocument(previous, next)).toEqual({
      meta: { name: 'p', registryVersions: { walls: 1 } },
    })
  })
})

describe('graftWithTable opaque maps of the real document', () => {
  it('restores a previous-only key inside the root extensions', () => {
    const previous = { extensions: { 'com.x.kept': { a: 1 }, 'com.x.shared': { b: 'old' } } }
    const next = { extensions: { 'com.x.shared': { b: 'new' } } }
    expect(graftDocument(previous, next)).toEqual({
      extensions: { 'com.x.kept': { a: 1 }, 'com.x.shared': { b: 'new' } },
    })
  })

  it('restores a previous-only key inside the customizations of a furniture piece', () => {
    const previous = { id: 'c1', customizations: { finish: 'oak', stain: 'dark' } }
    const next = { id: 'c1', customizations: { finish: 'pine' } }
    const grafted = graftWithTable(previous, next, {
      table: KNOWN_KEYS,
      at: objectAt('FurnitureInstance'),
    })
    expect(grafted).toEqual({ id: 'c1', customizations: { finish: 'pine', stain: 'dark' } })
  })
})

const SHELF_TABLE: KnownKeyTable = {
  Shelf: {
    keys: { crates: { kind: 'map', value: objectAt('Crate') }, tags: { kind: 'opaque' } },
    optional: ['crates', 'tags'],
  },
  Crate: {
    keys: { label: { kind: 'leaf' } },
    optional: ['label'],
  },
}

function graftShelf(previous: unknown, next: unknown): unknown {
  return graftWithTable(previous, next, { table: SHELF_TABLE, at: objectAt('Shelf') })
}

describe('graftWithTable typed map under a name that no list holds', () => {
  it('leaves a deleted entry deleted', () => {
    const previous = { crates: { c1: { label: 'one' }, c2: { label: 'two' } } }
    const next = { crates: { c1: { label: 'one' } } }
    expect(graftShelf(previous, next)).toEqual({ crates: { c1: { label: 'one' } } })
  })

  it('leaves a cleared field of a surviving entry cleared', () => {
    const previous = { crates: { c1: { label: 'one' } } }
    const next = { crates: { c1: {} } }
    expect(graftShelf(previous, next)).toEqual({ crates: { c1: {} } })
  })

  it('leaves the map empty when the next document deleted every entry', () => {
    const previous = { crates: { c1: { label: 'one' } } }
    expect(graftShelf(previous, { crates: {} })).toEqual({ crates: {} })
  })

  it('restores a previous-only key inside an opaque map beside it', () => {
    const previous = { tags: { kept: 1, shared: 'old' } }
    const next = { tags: { shared: 'new' } }
    expect(graftShelf(previous, next)).toEqual({ tags: { kept: 1, shared: 'new' } })
  })
})

const INHERITED_ENTRY_NAMES = ['constructor', 'toString', 'hasOwnProperty', 'valueOf']

describe('graftWithTable map entries named like inherited properties', () => {
  it.each(INHERITED_ENTRY_NAMES)('leaves a deleted entry named %s deleted', (name) => {
    const previous = { crates: { [name]: { label: 'gone' }, c1: { label: 'one' } } }
    const next = { crates: { c1: { label: 'one' } } }
    const grafted = graftShelf(previous, next) as { crates: Record<string, unknown> }
    expect(Object.hasOwn(grafted.crates, name)).toBe(false)
    expect(grafted).toEqual({ crates: { c1: { label: 'one' } } })
  })

  it.each(INHERITED_ENTRY_NAMES)('takes a surviving entry named %s from the next map', (name) => {
    const previous = { crates: { [name]: { label: 'old' } } }
    const next = { crates: { [name]: {} } }
    const grafted = graftShelf(previous, next) as { crates: Record<string, unknown> }
    expect(Object.hasOwn(grafted.crates, name)).toBe(true)
    expect(grafted.crates[name]).toEqual({})
  })

  it.each(INHERITED_ENTRY_NAMES)('restores a previous-only opaque key named %s', (name) => {
    const previous = { tags: { [name]: { depth: { value: 1 } } } }
    const grafted = graftShelf(previous, { tags: {} }) as { tags: Record<string, unknown> }
    expect(Object.hasOwn(grafted.tags, name)).toBe(true)
    expect(grafted.tags[name]).toEqual({ depth: { value: 1 } })
  })
})

describe('graftWithTable map entries named __proto__', () => {
  it('leaves a deleted entry deleted without touching the prototype of the map', () => {
    const previous: unknown = JSON.parse(
      '{"crates":{"__proto__":{"label":"gone"},"c1":{"label":"one"}}}',
    )
    const next = { crates: { c1: { label: 'one' } } }
    const grafted = graftShelf(previous, next) as { crates: object }
    expect(Object.hasOwn(grafted.crates, '__proto__')).toBe(false)
    expect(Object.getPrototypeOf(grafted.crates)).toBe(Object.prototype)
    expect(JSON.stringify(grafted)).toBe('{"crates":{"c1":{"label":"one"}}}')
  })

  it('keeps a surviving entry as an own key of the next map', () => {
    const previous: unknown = JSON.parse('{"crates":{"__proto__":{"label":"old"}}}')
    const next: unknown = JSON.parse('{"crates":{"__proto__":{}}}')
    const grafted = graftShelf(previous, next) as { crates: object }
    expect(Object.hasOwn(grafted.crates, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(grafted.crates)).toBe(Object.prototype)
    expect(JSON.stringify(grafted)).toBe('{"crates":{"__proto__":{}}}')
  })

  it('restores a previous-only opaque key as an own key', () => {
    const previous: unknown = JSON.parse('{"tags":{"__proto__":{"fromANewerBuild":true}}}')
    const grafted = graftShelf(previous, { tags: {} }) as { tags: object }
    expect(Object.hasOwn(grafted.tags, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(grafted.tags)).toBe(Object.prototype)
    expect(JSON.stringify(grafted)).toBe('{"tags":{"__proto__":{"fromANewerBuild":true}}}')
  })
})
