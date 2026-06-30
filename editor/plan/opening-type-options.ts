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
export function humanizeId(id: string): string {
  return id
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
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
