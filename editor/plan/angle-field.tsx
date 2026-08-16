import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { Field } from '../design-system'
import { DEG_TO_RAD, RAD_TO_DEG } from './angles'

const ANGLE_DECIMAL_PLACES = 2

// Render degrees without trailing-zero cruft so a right angle shows "90".
function formatDegrees(radians: number): string {
  return String(Number((radians * RAD_TO_DEG).toFixed(ANGLE_DECIMAL_PLACES)))
}

export interface AngleFieldProps {
  inputId: string
  /** The current angle in radians; the field shows and reads it in degrees. */
  rotation: number
  /** Receives the committed angle in radians, on Enter or on blur. */
  onCommit: (rotation: number) => void
}

/**
 * The shared free-angle entry field for an inspector: it renders an angle in
 * degrees, since that is what people type, and commits it back in radians, the
 * unit the model and the rotation commands carry. An entry that does not parse
 * as a finite number commits nothing, leaving the last good angle standing.
 */
export function AngleField({ inputId, rotation, onCommit }: AngleFieldProps): ReactElement {
  const [text, setText] = useState(formatDegrees(rotation))

  function commit(): void {
    const parsed = Number.parseFloat(text)
    if (Number.isFinite(parsed)) {
      onCommit(parsed * DEG_TO_RAD)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <Field htmlFor={inputId} label="Angle (deg)">
      <input
        id={inputId}
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
    </Field>
  )
}
