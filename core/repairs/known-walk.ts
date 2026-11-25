import { KNOWN_KEYS, KNOWN_ROOT_TYPE, variantTypeOf } from '../model/known-keys'
import type { KnownType, KnownUnion, KnownValue } from '../model/known-keys'
import { childPointer, sortedPointers } from './json-pointer'

/** An object at a place that the table of known keys describes. */
export interface KnownObject {
  readonly pointer: string
  readonly value: Record<string, unknown>
  /** The type of the object. For a union entry, the type of the variant that its tag names. */
  readonly ownType: KnownType
  /** The types whose keys count as defined here: the own type, or every variant at a union. */
  readonly defined: readonly KnownType[]
}

type KeysToRemove = (object: KnownObject) => readonly string[]

interface Walk {
  readonly keysToRemove: KeysToRemove
  readonly removed: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// A type is known only as an own entry of the table; a name every object inherits is not a type.
function knownTypeOf(typeName: string): KnownType | undefined {
  return Object.hasOwn(KNOWN_KEYS, typeName) ? KNOWN_KEYS[typeName] : undefined
}

function removeKeys(object: KnownObject, walk: Walk): void {
  for (const key of walk.keysToRemove(object)) {
    Reflect.deleteProperty(object.value, key)
    walk.removed.push(childPointer(object.pointer, key))
  }
}

/** A place whose object has one named type, and whose keys are defined by `definedTypeNames`. */
interface TypedPlace {
  readonly pointer: string
  readonly typeName: string
  readonly definedTypeNames: readonly string[]
}

/** A place that holds a tagged union, whose tag names the variant of the entry. */
interface UnionPlace {
  readonly pointer: string
  readonly union: KnownUnion
}

/** A place with the value that the table of known keys expects there. */
interface KnownPlace {
  readonly pointer: string
  readonly expected: KnownValue
}

function walkTyped(value: unknown, place: TypedPlace, walk: Walk): void {
  const ownType = knownTypeOf(place.typeName)
  if (ownType === undefined || !isPlainObject(value)) {
    return
  }
  const defined = place.definedTypeNames.flatMap((name) => knownTypeOf(name) ?? [])
  removeKeys({ pointer: place.pointer, value, ownType, defined }, walk)
  for (const key of Object.keys(value)) {
    const expected = Object.hasOwn(ownType.keys, key) ? ownType.keys[key] : undefined
    if (expected !== undefined) {
      walkKnown(value[key], { pointer: childPointer(place.pointer, key), expected }, walk)
    }
  }
}

// An entry whose tag names no variant is skipped whole.
function walkUnion(value: unknown, place: UnionPlace, walk: Walk): void {
  const { pointer, union } = place
  if (!isPlainObject(value)) {
    return
  }
  const variantTypeName = variantTypeOf(union, value[union.tag])
  if (variantTypeName !== undefined) {
    const definedTypeNames = union.variants.map((variant) => variant.type)
    walkTyped(value, { pointer, typeName: variantTypeName, definedTypeNames }, walk)
  }
}

// Only an object, a union variant, an array item, and a map value are entered. A leaf and an opaque
// value are not, and a value of another shape than the table says is skipped.
function walkKnown(value: unknown, place: KnownPlace, walk: Walk): void {
  const { pointer, expected } = place
  if (expected.kind === 'object') {
    walkTyped(value, { pointer, typeName: expected.type, definedTypeNames: [expected.type] }, walk)
  } else if (expected.kind === 'union') {
    walkUnion(value, { pointer, union: expected }, walk)
  } else if (expected.kind === 'array' && Array.isArray(value)) {
    value.forEach((item, index) => {
      walkKnown(item, { pointer: childPointer(pointer, index), expected: expected.item }, walk)
    })
  } else if (expected.kind === 'map' && isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      walkKnown(value[key], { pointer: childPointer(pointer, key), expected: expected.value }, walk)
    }
  }
}

/**
 * A copy of the document without the keys that `keysToRemove` names for each known object, and the
 * sorted pointers of what was removed. The input is not changed. A key of a map is data and is never
 * offered for removal. A document that is no object comes back as it is.
 */
export function removeFromKnownObjects(
  document: unknown,
  keysToRemove: KeysToRemove,
): { readonly document: unknown; readonly removed: readonly string[] } {
  if (!isPlainObject(document)) {
    return { document, removed: [] }
  }
  const copy: unknown = structuredClone(document)
  const walk: Walk = { keysToRemove, removed: [] }
  walkTyped(
    copy,
    { pointer: '', typeName: KNOWN_ROOT_TYPE, definedTypeNames: [KNOWN_ROOT_TYPE] },
    walk,
  )
  return { document: copy, removed: sortedPointers(walk.removed) }
}
