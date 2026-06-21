import { builtinElementTypes, type ElementType, type OpeningFamily } from '../../core'

// Window families render under the Windows group; every other opening family
// (swing, slide, fold, pivot, cased) reads as a door-like opening.
const WINDOW_FAMILIES: ReadonlySet<OpeningFamily> = new Set(['window-fixed', 'window-crank'])

function isWindow(type: ElementType): boolean {
  const family = type.opening?.family
  return family !== undefined && WINDOW_FAMILIES.has(family)
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
