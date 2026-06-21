import { type ReactElement } from 'react'
import { type ElementType } from '../../core'
import { useOpeningTool } from './opening-tool-context'
import { groupedOpeningTypes, humanizeId } from './opening-type-options'

const OPENING_TYPE_SELECT_ID = 'opening-type'

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
