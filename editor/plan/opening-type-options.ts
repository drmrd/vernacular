import { builtinElementTypes, openingKindOfType, type ElementType } from '../../core'

// An opening renders under the Windows group when the shared door-or-window
// classifier reads its type as a window; every door family reads as a door. This
// derives from the one classifier (openingKindOfType) rather than a second window
// list, so a new window family groups correctly without another edit here.
function isWindow(type: ElementType): boolean {
  return openingKindOfType(type.id) === 'window'
}

// A readable label from the element-type id: kebab-case to Title Case so the
// option text reads as English without a separate label store.
function humanizeId(id: string): string {
  return id
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

// A cased opening is the one opening with nothing hung in it: a trimmed hole a
// person walks through. "Cased opening" is the trade term and reads as nothing in
// particular to an owner searching the list for a doorway with no door, so the
// option says what it is. Every other family is named for what it plainly is.
const CASED_OPENING_ID = 'cased-opening'
const CASED_OPENING_GLOSS = ' (open doorway)'

/** The option text for an opening type, as the chooser and the inspector list it. */
export function openingTypeLabel(type: ElementType): string {
  const name = humanizeId(type.id)
  return type.id === CASED_OPENING_ID ? `${name}${CASED_OPENING_GLOSS}` : name
}

function openingTypes(): ElementType[] {
  return Object.values(builtinElementTypes.entries).filter((type) => type.category === 'opening')
}

// Splits the opening-category element types into the two option groups the
// chooser and the inspector both render: doors first, then windows.
export function groupedOpeningTypes(): { doors: ElementType[]; windows: ElementType[] } {
  const types = openingTypes()
  return {
    doors: types.filter((type) => !isWindow(type)),
    windows: types.filter(isWindow),
  }
}
