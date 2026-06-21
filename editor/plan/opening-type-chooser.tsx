import { type ReactElement } from 'react'
import { builtinElementTypes, type ElementType, type OpeningFamily } from '../../core'
import { useOpeningTool } from './opening-tool-context'

const OPENING_TYPE_SELECT_ID = 'opening-type'

// Window families render under the Windows group; every other opening family
// (swing, slide, fold, pivot, cased) reads as a door-like opening.
const WINDOW_FAMILIES: ReadonlySet<OpeningFamily> = new Set(['window-fixed', 'window-crank'])

function isWindow(type: ElementType): boolean {
  const family = type.opening?.family
  return family !== undefined && WINDOW_FAMILIES.has(family)
}

// A readable label from the element-type id: kebab-case to Title Case so the
// option text reads as English without a separate label store.
function humanizeId(id: string): string {
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

interface OpeningOptionGroupProps {
  label: string
  types: readonly ElementType[]
}

export function OpeningOptionGroup({ label, types }: OpeningOptionGroupProps): ReactElement | null {
  if (types.length === 0) {
    return null
  }
  return (
    <optgroup label={label}>
      {types.map((type) => (
        <option key={type.id} value={type.id}>
          {humanizeId(type.id)}
        </option>
      ))}
    </optgroup>
  )
}

/**
 * Picks the element type the place-opening tool places next. Lists every
 * opening-category entry, grouped into doors and windows, bound to the shared
 * opening-tool context. Coverage-excluded glue rendered while the place-opening
 * tool is active.
 */
export function OpeningTypeChooser(): ReactElement {
  const { placementType, setPlacementType } = useOpeningTool()
  const { doors, windows } = groupedOpeningTypes()
  return (
    <div>
      <label htmlFor={OPENING_TYPE_SELECT_ID}>Opening type</label>
      <select
        id={OPENING_TYPE_SELECT_ID}
        value={placementType}
        onChange={(event) => setPlacementType(event.target.value)}
      >
        <OpeningOptionGroup label="Doors" types={doors} />
        <OpeningOptionGroup label="Windows" types={windows} />
      </select>
    </div>
  )
}
