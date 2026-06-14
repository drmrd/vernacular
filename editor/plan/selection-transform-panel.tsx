import { useState, type ReactElement } from 'react'
import { rotateEntities, type Command, type Point } from '../../core'
import { Button } from '../design-system'
import './selection-transform-panel.css'

const QUARTER_TURN = Math.PI / 2
const STRAIGHT_ANGLE_DEGREES = 180
const DEGREES_TO_RADIANS = Math.PI / STRAIGHT_ANGLE_DEGREES

export interface SelectionTransformPanelProps {
  floorId: string
  entityIds: readonly string[]
  center: Point
  dispatch: (command: Command) => void
}

export function SelectionTransformPanel({
  floorId,
  entityIds,
  center,
  dispatch,
}: SelectionTransformPanelProps): ReactElement {
  const [angle, setAngle] = useState('')

  function rotateBy(radians: number): void {
    dispatch(rotateEntities(floorId, [...entityIds], center, radians))
  }

  function applyAngle(): void {
    const degrees = Number.parseFloat(angle)
    if (!Number.isFinite(degrees)) {
      return
    }
    rotateBy(degrees * DEGREES_TO_RADIANS)
  }

  return (
    <div className="selection-transform-panel">
      <div className="selection-transform-panel__rotations">
        <Button onClick={() => rotateBy(QUARTER_TURN)}>Rotate counter-clockwise</Button>
        <Button onClick={() => rotateBy(-QUARTER_TURN)}>Rotate clockwise</Button>
      </div>
      <form
        className="selection-transform-panel__angle"
        onSubmit={(event) => {
          event.preventDefault()
          applyAngle()
        }}
      >
        <label className="selection-transform-panel__angle-label">
          Angle
          <input
            className="selection-transform-panel__angle-input"
            type="number"
            value={angle}
            onChange={(event) => setAngle(event.target.value)}
          />
        </label>
        <Button type="submit">Apply</Button>
      </form>
    </div>
  )
}
