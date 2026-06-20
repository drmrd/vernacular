import { useState, type KeyboardEvent, type ReactElement } from 'react'
import {
  formatAdaptiveLength,
  parseLength,
  type AssumedUnit,
  type UnitPreferences,
} from '../../core'
import { Field } from '../design-system'
import { lengthRejectionMessage } from './length-rejection-message'

export interface LengthFieldProps {
  inputId: string
  label: string
  valueMm: number
  preferences: UnitPreferences
  assumeUnit: AssumedUnit
  onCommitMm: (mm: number) => void
}

/**
 * A unit-aware length input: it seeds from the adaptive-formatted value, lets the
 * user retype freely, and commits the parsed millimetre value on Enter. An
 * unparseable entry dispatches nothing and keeps its text, so a stray keystroke
 * never resizes anything. Shared by the opening and furniture inspectors.
 */
export function LengthField({
  inputId,
  label,
  valueMm,
  preferences,
  assumeUnit,
  onCommitMm,
}: LengthFieldProps): ReactElement {
  const [text, setText] = useState(() => formatAdaptiveLength(valueMm, preferences))
  const [error, setError] = useState<string | null>(null)

  function commit(): void {
    try {
      onCommitMm(parseLength(text, { assumeUnit }))
      setError(null)
    } catch (err) {
      // A rejected command or unparseable entry keeps the text without dispatching.
      const message = lengthRejectionMessage(err)
      if (message) {
        setError(message)
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <Field htmlFor={inputId} label={label} hint={error ?? undefined}>
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
