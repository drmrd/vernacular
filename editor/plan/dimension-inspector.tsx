import { type ReactElement } from 'react'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  formatAdaptiveLength,
  removeDimension,
  type Command,
  type UnitPreferences,
  type UnitSystem,
} from '../../core'
import { RemoveControl } from './remove-control'

// Default unit preferences for each system. The inspector formats the measured
// length against the active system's defaults, mirroring the opening inspector.
const PREFERENCES_BY_UNITS: Record<UnitSystem, UnitPreferences> = {
  metric: DEFAULT_METRIC_PREFERENCES,
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
}

export interface DimensionInspectorProps {
  floorId: string
  dimensionId: string
  length: number
  units: UnitSystem
  dispatch: (command: Command) => void
}

export function DimensionInspector({
  floorId,
  dimensionId,
  length,
  units,
  dispatch,
}: DimensionInspectorProps): ReactElement {
  const preferences = PREFERENCES_BY_UNITS[units]
  const formatted = formatAdaptiveLength(length, preferences)

  return (
    <div>
      <p>
        Length: <span>{formatted}</span>
      </p>
      <RemoveControl onConfirm={() => dispatch(removeDimension(floorId, dimensionId))} />
    </div>
  )
}
