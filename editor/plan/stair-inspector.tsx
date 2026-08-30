import type { ReactElement } from 'react'
import { rotateStair, type Command, type Stair } from '../../core'
import { Stack } from '../design-system'
import { AngleField } from './angle-field'

export interface StairInspectorProps {
  stair: Stair
  dispatch: (command: Command) => void
}

/**
 * The inspector panel for a single selected stair. Turning the run is the one
 * edit it offers so far; the run type and the flight dimensions are a later
 * slice. Shares the angle field with `FurnitureInspector`.
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
