import type { DataRemovingRepair } from './data-removing-repair'
import { removeFromKnownObjects } from './known-walk'
import type { KnownObject } from './known-walk'

const PAINT_ENTRY_PREFIX = /^\/paint\/[^/]+/

function isPaintEntry(pointer: string): boolean {
  return PAINT_ENTRY_PREFIX.exec(pointer)?.[0] === pointer
}

// The keys of another variant: defined by a variant of the union, but not by the entry's own variant.
// Only a paint entry is repaired. An underlay source that mixes kinds has no repair and still refuses.
function otherVariantKeysOf({ pointer, value, ownType, defined }: KnownObject): string[] {
  if (!isPaintEntry(pointer)) {
    return []
  }
  return Object.keys(value).filter(
    (key) =>
      !Object.hasOwn(ownType.keys, key) && defined.some((type) => Object.hasOwn(type.keys, key)),
  )
}

function paintEntriesOf(removed: readonly string[]): Set<string> {
  const prefixes = removed
    .map((pointer) => PAINT_ENTRY_PREFIX.exec(pointer))
    .filter((m) => m !== null)
  return new Set(prefixes.map((match) => match[0]))
}

function describePaintEntries(removed: readonly string[]): string {
  const count = paintEntriesOf(removed).size
  return count === 1
    ? 'It removes the extra data from 1 paint entry.'
    : `It removes the extra data from ${String(count)} paint entries.`
}

export const mixedPaintEntry: DataRemovingRepair = {
  id: 'mixed-paint-entry',
  recognizes: (document) => removeFromKnownObjects(document, otherVariantKeysOf).removed.length > 0,
  apply: (document) => removeFromKnownObjects(document, otherVariantKeysOf),
  describe: describePaintEntries,
}
