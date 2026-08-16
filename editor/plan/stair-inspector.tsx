import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { rotateStair, type Command, type Stair } from '../../core'
import { Field, Stack } from '../design-system'
import { DEG_TO_RAD, RAD_TO_DEG } from './angles'

const ANGLE_DECIMAL_PLACES = 2

// Render degrees without trailing-zero cruft so a right angle shows "90".
function formatDegrees(radians: number): string {
  return String(Number((radians * RAD_TO_DEG).toFixed(ANGLE_DECIMAL_PLACES)))
}

interface AngleFieldProps {
  inputId: string
  rotation: number
  onCommit: (rotation: number) => void
}

function AngleField({ inputId, rotation, onCommit }: AngleFieldProps): ReactElement {
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

export interface StairInspectorProps {
  stair: Stair
  dispatch: (command: Command) => void
}

/**
 * The inspector panel for a single selected stair. Turning the run is the one
 * edit it offers so far; the run type and the flight dimensions are a later
 * slice. Mirrors `FurnitureInspector`, which owns the same angle field.
 */
export function StairInspector({ stair, dispatch }: StairInspectorProps): ReactElement {
  return (
    <Stack gap="space-2">
      <AngleField
        inputId={`stair-angle-${stair.id}`}
        rotation={stair.rotation}
        onCommit={(rotation) => dispatch(rotateStair(stair.id, rotation))}
      />
    </Stack>
  )
}
