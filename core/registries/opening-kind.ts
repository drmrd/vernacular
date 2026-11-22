import { builtinElementTypes, type OpeningFamily } from './element-types'
import { getEntry } from './registry'

/** Whether an opening reads as a door or a window. */
export type OpeningKind = 'door' | 'window'

const DOOR_FAMILIES = ['swing', 'slide', 'fold', 'pivot', 'cased'] as const

/** The family of a door opening: how its leaf moves, or a cased hole with none. */
export type DoorFamily = (typeof DOOR_FAMILIES)[number]

const doorFamilies: ReadonlySet<OpeningFamily> = new Set<OpeningFamily>(DOOR_FAMILIES)

/**
 * Classifies a built-in element type as a door or window opening. Returns `undefined`
 * when the id is unknown or the type is not an opening.
 */
export function openingKindOfType(typeId: string): OpeningKind | undefined {
  const family = openingFamilyOfType(typeId)
  if (family === undefined) {
    return undefined
  }
  return isDoorFamily(family) ? 'door' : 'window'
}

function openingFamilyOfType(typeId: string): OpeningFamily | undefined {
  return getEntry(builtinElementTypes, typeId)?.opening?.family
}

function isDoorFamily(family: OpeningFamily): family is DoorFamily {
  return doorFamilies.has(family)
}

/** The door family of a built-in opening type; undefined for a window type or an unknown id. */
export function doorFamilyOfType(typeId: string): DoorFamily | undefined {
  const family = openingFamilyOfType(typeId)
  return family !== undefined && isDoorFamily(family) ? family : undefined
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

const hingedFamilies: ReadonlySet<OpeningFamily> = new Set<OpeningFamily>([
  'swing',
  'fold',
  'pivot',
])

/**
 * Whether the opening type has a hinge side to choose: a swing, fold, or pivot opening, or a
 * casement window (a crank window hinged on its jamb). Matches the hinge use in
 * `core/scene/opening-motion.ts` (`jambHinge` and `crankHinge`); every other kind moves the same
 * either way. Returns `false` for an unknown id or a type that is not an opening.
 */
export function openingTypeHasHingeSide(typeId: string): boolean {
  const opening = getEntry(builtinElementTypes, typeId)?.opening
  if (opening === undefined) return false
  return (
    hingedFamilies.has(opening.family) ||
    (opening.family === 'window-crank' && opening.hingeEdge === 'jamb')
  )
}
