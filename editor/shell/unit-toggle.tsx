import type { ReactElement } from 'react'
import type { UnitSystem } from '../../core'
import { Segmented } from '../design-system'
import './unit-toggle.css'

export interface UnitToggleProps {
  units: UnitSystem
  onChange: (units: UnitSystem) => void
}

const UNIT_OPTIONS = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
] as const

const UNIT_SYSTEMS = UNIT_OPTIONS.map((option) => option.value)

function isUnitSystem(value: string): value is UnitSystem {
  return (UNIT_SYSTEMS as readonly string[]).includes(value)
}

export function UnitToggle({ units, onChange }: UnitToggleProps): ReactElement {
  return (
    <div className="unit-toggle">
      {/* Hidden from assistive tech: the Segmented group already names
          itself "Units" via aria-label, so this visible text is redundant
          for screen-reader users and would otherwise be announced twice. */}
      <span className="unit-toggle__label" aria-hidden="true">
        Units
      </span>
      <Segmented
        label="Units"
        options={[...UNIT_OPTIONS]}
        value={units}
        onSelect={(value) => {
          if (isUnitSystem(value)) onChange(value)
        }}
      />
    </div>
  )
}
