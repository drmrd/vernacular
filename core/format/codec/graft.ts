import { KNOWN_KEYS, KNOWN_ROOT_TYPE, variantTypeOf } from '../../model/known-keys'
import type { KnownKeyTable, KnownUnion, KnownValue } from '../../model/known-keys'
import type { Project } from '../../model/types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// A key from a file can be any name, `__proto__` included; a plain assignment with that name sets
// the prototype instead of creating a key, so every key from a file is written as an own property.
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

function graftObject(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    setOwn(result, key, graftUntypedMember(key, previous, next))
  }
  for (const key of Object.keys(previous)) {
    // A key the next document lacks is unknown or reserved data the reader dropped; preserve it.
    if (!Object.hasOwn(next, key)) {
      setOwn(result, key, previous[key])
    }
  }
  return result
}

function graftUntypedMember(
  key: string,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): unknown {
  return Object.hasOwn(previous, key) ? graftUntyped(previous[key], next[key]) : next[key]
}

function idOf(value: unknown): string | undefined {
  return isPlainObject(value) && typeof value.id === 'string' ? value.id : undefined
}

// Pair each next item with the previous item of the same id, if any, and graft the pair.
function graftById(
  previous: readonly unknown[],
  next: readonly unknown[],
  graftPair: (previousItem: unknown, nextItem: unknown) => unknown,
): unknown[] {
  return next.map((item) => {
    const id = idOf(item)
    const match =
      id === undefined ? undefined : previous.find((candidate) => idOf(candidate) === id)
    return match === undefined ? item : graftPair(match, item)
  })
}

function graftArray(previous: readonly unknown[], next: readonly unknown[]): unknown[] {
  return graftById(previous, next, graftUntyped)
}

// The graft where the table has nothing to say, such as inside the value of an unknown key: shared
// keys take the next value and previous-only keys are restored (VFPF section 6.4).
function graftUntyped(previous: unknown, next: unknown): unknown {
  if (Array.isArray(previous) && Array.isArray(next)) {
    return graftArray(previous, next)
  }
  if (isPlainObject(previous) && isPlainObject(next)) {
    return graftObject(previous, next)
  }
  return next
}

interface TablePosition {
  table: KnownKeyTable
  at: KnownValue
}

interface TypeScope {
  table: KnownKeyTable
  keys: Readonly<Record<string, KnownValue>>
}

// Only an own key of the table is known; a name every object inherits, such as `constructor`, is not.
function knownValueOf(scope: TypeScope, key: string): KnownValue | undefined {
  return Object.hasOwn(scope.keys, key) ? scope.keys[key] : undefined
}

// A type is known only as an own entry of the table; a name every object inherits, such as
// `toString`, is not a type.
function knownTypeOf(table: KnownKeyTable, typeName: string): KnownKeyTable[string] | undefined {
  return Object.hasOwn(table, typeName) ? table[typeName] : undefined
}

function graftKnownMember(
  key: string,
  { previous, next }: { previous: Record<string, unknown>; next: Record<string, unknown> },
  scope: TypeScope,
): unknown {
  const known = knownValueOf(scope, key)
  if (known === undefined) {
    return graftUntypedMember(key, previous, next)
  }
  const { table } = scope
  return Object.hasOwn(previous, key)
    ? graftWithTable(previous[key], next[key], { table, at: known })
    : next[key]
}

function graftObjectWithTable(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  scope: TypeScope,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    setOwn(result, key, graftKnownMember(key, { previous, next }, scope))
  }
  for (const key of Object.keys(previous)) {
    // A known key the next document lacks was cleared; only a key the table does not know is restored.
    if (!Object.hasOwn(next, key) && knownValueOf(scope, key) === undefined) {
      setOwn(result, key, previous[key])
    }
  }
  return result
}

function graftArrayWithTable(
  previous: readonly unknown[],
  next: readonly unknown[],
  position: TablePosition,
): unknown[] {
  return graftById(previous, next, (match, item) => graftWithTable(match, item, position))
}

// A map the schema types is a collection the model owns: an entry the next document omits was
// deleted and stays absent.
function graftMapWithTable(previous: unknown, next: unknown, position: TablePosition): unknown {
  if (!isPlainObject(previous) || !isPlainObject(next)) {
    return graftUntyped(previous, next)
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    setOwn(
      result,
      key,
      Object.hasOwn(previous, key) ? graftWithTable(previous[key], next[key], position) : next[key],
    )
  }
  return result
}

function sharesTag(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  tag: string,
): boolean {
  return Object.hasOwn(previous, tag) && Object.hasOwn(next, tag) && previous[tag] === next[tag]
}

// At a tagged union, only a value whose tag is the same on both sides is grafted, as an object of
// that variant's type. A changed or missing tag means a new value, so nothing of the old one belongs
// to it; the same tag means an edit, so data this build does not know must survive it.
function graftUnionWithTable(
  previous: unknown,
  next: unknown,
  { table, union }: { table: KnownKeyTable; union: KnownUnion },
): unknown {
  if (!isPlainObject(previous) || !isPlainObject(next)) {
    return next
  }
  const { tag } = union
  if (!sharesTag(previous, next, tag)) {
    return next
  }
  const variant = variantTypeOf(union, next[tag])
  // A tag no variant of the table names is of a variant from a newer build: graft it untyped.
  return variant === undefined
    ? graftObject(previous, next)
    : graftWithTable(previous, next, { table, at: { kind: 'object', type: variant } })
}

/** A pure function of the previous value, the next value, the table, and the place in it. */
export function graftWithTable(
  previous: unknown,
  next: unknown,
  { table, at }: TablePosition,
): unknown {
  if (at.kind === 'array' && Array.isArray(previous) && Array.isArray(next)) {
    return graftArrayWithTable(previous, next, { table, at: at.item })
  }
  if (at.kind === 'map') {
    return graftMapWithTable(previous, next, { table, at: at.value })
  }
  if (at.kind === 'union') {
    return graftUnionWithTable(previous, next, { table, union: at })
  }
  const knownType = at.kind === 'object' ? knownTypeOf(table, at.type) : undefined
  if (knownType !== undefined && isPlainObject(previous) && isPlainObject(next)) {
    return graftObjectWithTable(previous, next, { table, keys: knownType.keys })
  }
  return graftUntyped(previous, next)
}

const ROOT_POSITION: TablePosition = {
  table: KNOWN_KEYS,
  at: { kind: 'object', type: KNOWN_ROOT_TYPE },
}

/**
 * Re-graft any value the previous Document carried that the next Document dropped, so a
 * read-modify-write cycle preserves extension payloads and reserved keys a reader does not
 * model (VFPF section 6.4). The graft follows the table of known keys from the Document root.
 * Production code calls `preserveUnknown`; this untyped-result form serves the tests.
 */
export function graftUnknown(previous: unknown, next: unknown): unknown {
  return graftWithTable(previous, next, ROOT_POSITION)
}

/** Apply the preservation overlay, returning a Document that restores dropped unknown data. */
export function preserveUnknown(previous: unknown, project: Project): Project {
  // The graft only adds keys the typed model omits, so the result is still a Project shape.
  return graftUnknown(previous, project) as Project
}
