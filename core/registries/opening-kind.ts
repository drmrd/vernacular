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

/**
 * Whether the opening type hangs a body in its void: the `scene3D.fill` the 3D
 * builder renders there, a door leaf on a door and a sash on a window. A type
 * without one, such as a cased opening, is a trimmed hole with nothing in it to
 * open or shut. Named for the `fill` field rather than for the leaf, since the
 * predicate answers for windows too. Returns `false` for an unknown id or a type
 * that is not an opening, neither of which has a body to speak of.
 */
export function openingTypeHasFill(typeId: string): boolean {
  return getEntry(builtinElementTypes, typeId)?.scene3D.fill !== undefined
}
