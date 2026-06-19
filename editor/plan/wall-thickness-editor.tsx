import { useState, type KeyboardEvent } from 'react'
import {
  formatAdaptiveLength,
  parseLength,
  setWallThickness,
  type AssumedUnit,
  type UnitPreferences,
  type UnitSystem,
} from '../../core'
import { Field } from '../design-system'

// A bare number entered for a metric project means millimetres; for an imperial
// project it means feet. This is the active system's assume-unit, so a number
// without a unit token still parses.
const ASSUME_UNIT_BY_SYSTEM: Record<UnitSystem, AssumedUnit> = {
  metric: 'mm',
  imperial: 'ft',
}

export interface WallThicknessEditorProps {
  floorId: string
  wallId: string
  thickness: number
  dispatch: (command: unknown) => void
  preferences: UnitPreferences
}

export function WallThicknessEditor({
  floorId,
  wallId,
  thickness,
  dispatch,
  preferences,
}: WallThicknessEditorProps) {
  const formatted = formatAdaptiveLength(thickness, preferences)
  const [text, setText] = useState(formatted)
  const inputId = `wall-thickness-${wallId}`

  function commit() {
    const assumeUnit = ASSUME_UNIT_BY_SYSTEM[preferences.system]
    try {
      const parsed = parseLength(text, { assumeUnit })
      dispatch(setWallThickness(floorId, wallId, parsed))
    } catch {
      // An unparseable entry dispatches nothing; the input keeps its invalid text.
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <Field htmlFor={inputId} label="Thickness">
      <input
        id={inputId}
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </Field>
  )
}
