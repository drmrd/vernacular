import { useState, type ReactElement } from 'react'
import { rotateEntities, type Command, type Point } from '../../core'

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
    rotateBy(Number.parseFloat(angle) * DEGREES_TO_RADIANS)
  }

  return (
    <div>
      <button type="button" onClick={() => rotateBy(QUARTER_TURN)}>
        Rotate counter-clockwise
      </button>
      <button type="button" onClick={() => rotateBy(-QUARTER_TURN)}>
        Rotate clockwise
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          applyAngle()
        }}
      >
        <label>
          Angle
          <input type="number" value={angle} onChange={(event) => setAngle(event.target.value)} />
        </label>
        <button type="submit">Apply</button>
      </form>
    </div>
  )
}
