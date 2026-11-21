import { KNOWN_KEYS, KNOWN_ROOT_TYPE, variantTypeOf } from '../model/known-keys'
import type { KnownType, KnownUnion, KnownValue } from '../model/known-keys'
import { childPointer, sortedPointers } from './json-pointer'

/** An object at a place that the table of known keys describes. */
export interface KnownObject {
  readonly pointer: string
  readonly value: Record<string, unknown>
  /** The type of the object. For a union entry, the type of the variant that its tag names. */
  readonly own: KnownType
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

function walkTyped(
  value: unknown,
  place: { pointer: string; typeName: string; definedTypeNames: readonly string[] },
  walk: Walk,
): void {
  const own = knownTypeOf(place.typeName)
  if (own === undefined || !isPlainObject(value)) {
    return
  }
  const defined = place.definedTypeNames.flatMap((name) => knownTypeOf(name) ?? [])
  removeKeys({ pointer: place.pointer, value, own, defined }, walk)
  for (const key of Object.keys(value)) {
    const at = Object.hasOwn(own.keys, key) ? own.keys[key] : undefined
    if (at !== undefined) {
      walkAt(value[key], { pointer: childPointer(place.pointer, key), at }, walk)
    }
  }
}

// An entry whose tag names no variant is skipped whole.
function walkUnion(
  value: unknown,
  place: { pointer: string; union: KnownUnion },
  walk: Walk,
): void {
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
function walkAt(value: unknown, place: { pointer: string; at: KnownValue }, walk: Walk): void {
  const { pointer, at } = place
  if (at.kind === 'object') {
    walkTyped(value, { pointer, typeName: at.type, definedTypeNames: [at.type] }, walk)
  } else if (at.kind === 'union') {
    walkUnion(value, { pointer, union: at }, walk)
  } else if (at.kind === 'array' && Array.isArray(value)) {
    value.forEach((item, index) => {
      walkAt(item, { pointer: childPointer(pointer, index), at: at.item }, walk)
    })
  } else if (at.kind === 'map' && isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      walkAt(value[key], { pointer: childPointer(pointer, key), at: at.value }, walk)
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
