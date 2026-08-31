import {
  builtinElementTypes,
  humanizeElementTypeId,
  openingKindOfType,
  type ElementType,
} from '../../core'
import { openingTypeHasFill } from '../../core/registries/opening-kind'

// An opening renders under the Windows group when the shared door-or-window
// classifier reads its type as a window; every door family reads as a door. This
// derives from the one classifier (openingKindOfType) rather than a second window
// list, so a new window family groups correctly without another edit here.
function isWindow(type: ElementType): boolean {
  return openingKindOfType(type.id) === 'window'
}

// A cased opening is the one opening with nothing hung in it: a trimmed hole a
// person walks through. "Cased opening" is the trade term and reads as nothing in
// particular to an owner searching the list for a doorway with no door, so the
// option says what it is. Every other family is named for what it plainly is.
const CASED_OPENING_ID = 'cased-opening'
const CASED_OPENING_GLOSS = ' (open doorway)'

/** The option text for an opening type, as the chooser and the inspector list it. */
export function openingTypeLabel(type: ElementType): string {
  const name = humanizeElementTypeId(type.id)
  return type.id === CASED_OPENING_ID ? `${name}${CASED_OPENING_GLOSS}` : name
}

function openingTypes(): ElementType[] {
  return Object.values(builtinElementTypes.entries).filter((type) => type.category === 'opening')
}

/** The option groups the chooser and the inspector both render. */
export type GroupedOpeningTypes = {
  doors: ElementType[]
  windows: ElementType[]
  passages: ElementType[]
}

// Splits the opening-category element types into the option groups the chooser
// and the inspector both render. A passage has no fill (the leaf or sash a door
// or window hangs), so it groups apart from doors rather than hiding among them.
export function groupedOpeningTypes(): GroupedOpeningTypes {
  const types = openingTypes()
  const hungOpenings = types.filter((type) => openingTypeHasFill(type.id))
  return {
    doors: hungOpenings.filter((type) => !isWindow(type)),
    windows: hungOpenings.filter(isWindow),
    passages: types.filter((type) => !openingTypeHasFill(type.id)),
  }
}
