import { type ReactElement } from 'react'
import { builtinElementTypes, type ElementType, type OpeningFamily } from '../../core'
import { useOpeningTool } from './opening-tool-context'

const OPENING_TYPE_SELECT_ID = 'opening-type'

// Window families render under the Windows group; every other opening family
// (swing, slide, fold, pivot, cased) reads as a door-like opening.
const WINDOW_FAMILIES: ReadonlySet<OpeningFamily> = new Set(['window-fixed', 'window-crank'])

export function isWindow(type: ElementType): boolean {
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

export function openingTypes(): ElementType[] {
  return Object.values(builtinElementTypes.entries).filter((type) => type.category === 'opening')
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
  const types = openingTypes()
  const doors = types.filter((type) => !isWindow(type))
  const windows = types.filter(isWindow)
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
