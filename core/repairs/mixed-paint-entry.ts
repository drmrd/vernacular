import type { DataRemovingRepair } from './data-removing-repair'
import { removeFromKnownObjects } from './known-walk'
import type { KnownObject } from './known-walk'

const PAINT_ENTRY_POINTER = /^\/paint\/[^/]+$/
const PAINT_ENTRY_PREFIX = /^\/paint\/[^/]+/

// The keys of another variant: defined by a variant of the union, but not by the entry's own variant.
function otherVariantKeysOf({ pointer, value, own, defined }: KnownObject): string[] {
  if (!PAINT_ENTRY_POINTER.test(pointer)) {
    return []
  }
  return Object.keys(value).filter(
    (key) => !Object.hasOwn(own.keys, key) && defined.some((type) => Object.hasOwn(type.keys, key)),
  )
}

function paintEntriesOf(removed: readonly string[]): Set<string> {
  return new Set(removed.flatMap((pointer) => PAINT_ENTRY_PREFIX.exec(pointer) ?? []))
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
