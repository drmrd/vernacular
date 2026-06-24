import { builtinElementTypes, type OpeningFamily } from './element-types'
import { getEntry } from './registry'

/** Whether an opening reads as a door or a window. */
export type OpeningKind = 'door' | 'window'

const doorFamilies: ReadonlySet<OpeningFamily> = new Set([
  'swing',
  'slide',
  'fold',
  'pivot',
  'cased',
])

/**
 * Classifies a built-in element type as a door or window opening. Returns `undefined`
 * when the id is unknown or the type is not an opening.
 */
export function openingKindOfType(typeId: string): OpeningKind | undefined {
  const family = getEntry(builtinElementTypes, typeId)?.opening?.family
  if (family === undefined) {
    return undefined
  }
  return doorFamilies.has(family) ? 'door' : 'window'
}
