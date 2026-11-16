import { KNOWN_KEYS, KNOWN_ROOT_TYPE } from '../../core'
import type { KnownKeyTable, KnownValue, Project } from '../../core'

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

// Top-level members that are keyed collections of modeled entries, not entities. A key absent from
// `next` here is a user deletion, so it must not be re-grafted (unlike an unknown key on an entity).
const KEYED_COLLECTIONS = new Set(['roomOverrides', 'paint'])

function discriminantKind(value: unknown): unknown {
  return isPlainObject(value) ? value.kind : undefined
}

// A keyed collection's entries can themselves be a discriminated union (e.g. a paint entry may
// be a solid-color treatment or a pattern treatment, tagged by `kind`). Grafting field-by-field
// across a kind change would resurrect fields the new kind doesn't have and shouldn't carry, so
// treat a kind change as a full replacement instead of a merge. Same-kind entries still enrich
// via graftUnknown, which is what preserves reader-unknown fields per VFPF section 6.4. Any
// keyed collection whose entry shape grows variants over time relies on this guard.
function graftKeyedCollectionEntry(previous: unknown, next: unknown): unknown {
  const previousKind = discriminantKind(previous)
  const nextKind = discriminantKind(next)
  if (previousKind !== undefined && nextKind !== undefined && previousKind !== nextKind) {
    return next
  }
  return graftUnknown(previous, next)
}

function graftKeyedCollection(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    setOwn(
      result,
      key,
      Object.hasOwn(previous, key)
        ? graftKeyedCollectionEntry(previous[key], next[key])
        : next[key],
    )
  }
  return result
}

function graftObject(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    setOwn(result, key, graftMember(key, previous, next))
  }
  for (const key of Object.keys(previous)) {
    // A key the next document lacks is unknown or reserved data the reader dropped; preserve it.
    if (!Object.hasOwn(next, key)) {
      setOwn(result, key, previous[key])
    }
  }
  return result
}

function graftMember(
  key: string,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): unknown {
  const previousValue = previous[key]
  const nextValue = next[key]
  if (KEYED_COLLECTIONS.has(key) && isPlainObject(previousValue) && isPlainObject(nextValue)) {
    return graftKeyedCollection(previousValue, nextValue)
  }
  return Object.hasOwn(previous, key) ? graftUnknown(previousValue, nextValue) : nextValue
}

function idOf(value: unknown): string | undefined {
  return isPlainObject(value) && typeof value.id === 'string' ? value.id : undefined
}

function graftArray(previous: readonly unknown[], next: readonly unknown[]): unknown[] {
  return next.map((item) => {
    const id = idOf(item)
    const match =
      id === undefined ? undefined : previous.find((candidate) => idOf(candidate) === id)
    return match === undefined ? item : graftUnknown(match, item)
  })
}

/**
 * Re-graft any value the previous Document carried that the next Document dropped, so a
 * read-modify-write cycle preserves extension payloads and reserved keys a reader does not
 * model (VFPF section 6.4). Shared keys take the next value; previous-only keys are restored.
 */
export function graftUnknown(previous: unknown, next: unknown): unknown {
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

function graftKnownMember(
  key: string,
  { previous, next }: { previous: Record<string, unknown>; next: Record<string, unknown> },
  scope: TypeScope,
): unknown {
  const known = knownValueOf(scope, key)
  if (known === undefined || KEYED_COLLECTIONS.has(key)) {
    return graftMember(key, previous, next)
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
  return next.map((item) => {
    const id = idOf(item)
    const match =
      id === undefined ? undefined : previous.find((candidate) => idOf(candidate) === id)
    return match === undefined ? item : graftWithTable(match, item, position)
  })
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
  const knownType = at.kind === 'object' ? table[at.type] : undefined
  if (knownType !== undefined && isPlainObject(previous) && isPlainObject(next)) {
    return graftObjectWithTable(previous, next, { table, keys: knownType.keys })
  }
  return graftUnknown(previous, next)
}

/** Apply the preservation overlay, returning a Document that restores dropped unknown data. */
export function preserveUnknown(previous: unknown, project: Project): Project {
  // The graft only adds keys the typed model omits, so the result is still a Project shape.
  return graftWithTable(previous, project, {
    table: KNOWN_KEYS,
    at: { kind: 'object', type: KNOWN_ROOT_TYPE },
  }) as Project
}
