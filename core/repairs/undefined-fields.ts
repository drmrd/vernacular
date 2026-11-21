import type { DataRemovingRepair } from './data-removing-repair'
import { removeFromKnownObjects } from './known-walk'
import type { KnownObject } from './known-walk'

function undefinedKeysOf({ value, defined }: KnownObject): string[] {
  return Object.keys(value).filter((key) => !defined.some((type) => Object.hasOwn(type.keys, key)))
}

function describeFields(removed: readonly string[]): string {
  const count = removed.length
  return count === 1
    ? 'It removes 1 field that the format does not define.'
    : `It removes ${String(count)} fields that the format does not define.`
}

export const undefinedFields: DataRemovingRepair = {
  id: 'undefined-fields',
  recognizes: (document) => removeFromKnownObjects(document, undefinedKeysOf).removed.length > 0,
  apply: (document) => removeFromKnownObjects(document, undefinedKeysOf),
  describe: describeFields,
}
