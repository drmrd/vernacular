import { describe, expect, it } from 'vitest'
import type { CommandRegistry } from './command-registry'
import { COMMAND_SAMPLES } from './testing/command-samples'
import { REMOVED_OBJECTS } from './testing/command-removals'
import { UNKNOWN_PROBE_KEY, createExtensionsFixture } from './testing/extensions-fixture'
import { dispatchSample, fullRegistry } from './testing/sample-results'
import {
  KNOWN_KEYS,
  KNOWN_ROOT_TYPE,
  typesWithExtensions,
  variantTypeOf,
  type KnownValue,
} from '../model/known-keys'
import type { Project } from '../model/types'

type JsonObject = Record<string, unknown>

/** An object whose schema type carries `extensions`, with the name of that type. */
interface Carrier {
  readonly typeName: string
  readonly value: JsonObject
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Walks a document along the table of known keys and collects every object whose
 * type carries `extensions`. An object with an id is named by its type and id;
 * the root, the meta, and nested objects without an id are named by their path
 * from the nearest named ancestor.
 */
class CarrierCollector {
  readonly carriers = new Map<string, Carrier>()

  visitObject(value: unknown, typeName: string, path: string): void {
    const known = KNOWN_KEYS[typeName]
    if (!isJsonObject(value) || known === undefined) {
      return
    }
    const identity = typeof value.id === 'string' ? `${typeName}#${value.id}` : path
    if (known.keys.extensions !== undefined) {
      this.carriers.set(identity, { typeName, value })
    }
    for (const [key, knownValue] of Object.entries(known.keys)) {
      this.visitValue(value[key], knownValue, `${identity}/${key}`)
    }
  }

  visitValue(value: unknown, known: KnownValue, path: string): void {
    if (known.kind === 'object') {
      this.visitObject(value, known.type, path)
    } else if (known.kind === 'union' && isJsonObject(value)) {
      const member = variantTypeOf(known, value[known.tag])
      this.visitObject(value, member ?? '', path)
    } else if (known.kind === 'array' && Array.isArray(value)) {
      value.forEach((item: unknown, index) => {
        this.visitValue(item, known.item, `${path}[${String(index)}]`)
      })
    } else if (known.kind === 'map' && isJsonObject(value)) {
      for (const [key, entry] of Object.entries(value)) {
        this.visitValue(entry, known.value, `${path}/${key}`)
      }
    }
  }
}

/** Every object of the document whose type carries `extensions`, by identity. */
function carriersOf(project: Project): Map<string, Carrier> {
  const collector = new CarrierCollector()
  collector.visitObject(project, KNOWN_ROOT_TYPE, KNOWN_ROOT_TYPE)
  return collector.carriers
}

/** The identities of the carriers that hold an `extensions` value. */
function identitiesWithExtensions(carriers: Map<string, Carrier>): string[] {
  return [...carriers].filter(([, { value }]) => value.extensions !== undefined).map(([id]) => id)
}

/** The types that carry `extensions` in the schema and have no probed object in the document. */
function typesMissingFrom(project: Project): string[] {
  const probed = [...carriersOf(project).values()].filter(({ value }) => {
    return value.extensions !== undefined && value[UNKNOWN_PROBE_KEY] !== undefined
  })
  const present = new Set(probed.map(({ typeName }) => typeName))
  return typesWithExtensions().filter((typeName) => !present.has(typeName))
}

/** The registered command types that have no sample parameters. */
function typesWithoutSamples(registry: CommandRegistry<Project>): string[] {
  return registry.types().filter((type) => COMMAND_SAMPLES[type] === undefined)
}

/** The `extensions` value and the unknown probe key of each named object. */
function keptData(carriers: Map<string, Carrier>, identities: string[]): JsonObject {
  const entries = identities.map((identity) => {
    const value = carriers.get(identity)?.value
    return [
      identity,
      { extensions: value?.extensions, [UNKNOWN_PROBE_KEY]: value?.[UNKNOWN_PROBE_KEY] },
    ]
  })
  return Object.fromEntries(entries) as JsonObject
}

/** The identities of the probed objects of `before` that `after` no longer holds, sorted. */
function missingFrom(before: Map<string, Carrier>, after: Map<string, Carrier>): string[] {
  return identitiesWithExtensions(before)
    .filter((identity) => !after.has(identity))
    .sort()
}

describe('the extensions fixture and the command samples', () => {
  it('give sample parameters to every registered command', () => {
    expect(typesWithoutSamples(fullRegistry())).toEqual([])
  })

  it('name a registered command that has no sample parameters', () => {
    const registry = fullRegistry().register('test.unsampled', { apply: () => undefined })

    expect(typesWithoutSamples(registry)).toEqual(['test.unsampled'])
  })

  it('carry extensions and the unknown key on every type the schema gives extensions', () => {
    expect(typesMissingFrom(createExtensionsFixture())).toEqual([])
  })

  it('name a type with extensions that the fixture lacks', () => {
    const withoutStairs: Project = { ...createExtensionsFixture(), stairs: [] }

    expect(typesMissingFrom(withoutStairs)).toEqual(['Stair'])
  })
})

describe('the check of removed objects', () => {
  it('names a probed object that a command removes', () => {
    const before = carriersOf(createExtensionsFixture())
    const after = carriersOf({ ...createExtensionsFixture(), stairs: [] })

    expect(missingFrom(before, after)).toEqual(['Stair#stair-main', 'Stair#stair-spare'])
  })
})

describe('every registered command', () => {
  it.each(fullRegistry().types())(
    '%s changes the document and removes only the objects its sample declares',
    (type) => {
      const original = createExtensionsFixture()
      const project = structuredClone(original)

      dispatchSample(project, type)

      const before = carriersOf(original)
      const after = carriersOf(project)
      expect(project).not.toEqual(original)
      expect(missingFrom(before, after)).toEqual([...(REMOVED_OBJECTS[type] ?? [])].sort())
    },
  )

  it.each(fullRegistry().types())(
    '%s keeps extensions and unknown keys on every object that survives it',
    (type) => {
      const original = createExtensionsFixture()
      const project = structuredClone(original)

      dispatchSample(project, type)

      const before = carriersOf(original)
      const after = carriersOf(project)
      const survivors = identitiesWithExtensions(before).filter((identity) => after.has(identity))
      expect(keptData(after, survivors)).toEqual(keptData(before, survivors))
    },
  )
})
