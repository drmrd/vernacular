import type { ReactElement } from 'react'
import type { UnitSystem } from '../../core'

export interface UnitToggleProps {
  units: UnitSystem
  onChange: (units: UnitSystem) => void
}

export function UnitToggle({ units, onChange }: UnitToggleProps): ReactElement {
  return (
    <fieldset className="unit-toggle" role="radiogroup">
      <legend>Units</legend>
      <label className="unit-toggle__option">
        <input
          type="radio"
          name="units"
          checked={units === 'metric'}
          onChange={() => onChange('metric')}
        />
        Metric
      </label>
      <label className="unit-toggle__option">
        <input
          type="radio"
          name="units"
          checked={units === 'imperial'}
          onChange={() => onChange('imperial')}
        />
        Imperial
      </label>
    </fieldset>
  )
}
