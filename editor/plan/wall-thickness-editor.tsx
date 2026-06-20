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
import { lengthRejectionMessage } from './length-rejection-message'

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
  const [text, setText] = useState(() => formatAdaptiveLength(thickness, preferences))
  const [error, setError] = useState<string | null>(null)
  const inputId = `wall-thickness-${wallId}`

  function commit() {
    const assumeUnit = ASSUME_UNIT_BY_SYSTEM[preferences.system]
    try {
      const parsed = parseLength(text, { assumeUnit })
      dispatch(setWallThickness(floorId, wallId, parsed))
      setError(null)
    } catch (err) {
      // A rejected command surfaces a recoverable error; both it and an
      // unparseable entry keep the invalid text without dispatching.
      const message = lengthRejectionMessage(err)
      if (message) {
        setError(message)
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') commit()
  }

  return (
    <Field htmlFor={inputId} label="Thickness" hint={error ?? undefined}>
      <input
        id={inputId}
        type="text"
        value={text}
        aria-invalid={error ? 'true' : undefined}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
    </Field>
  )
}
