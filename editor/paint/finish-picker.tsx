import {
  assignSurfacePaint,
  builtinFinishes,
  type Color,
  type Command,
  type SurfaceRef,
} from '../../core'

export interface FinishPickerProps {
  surface: SurfaceRef
  color: Color
  finishId: string
  dispatch: (command: Command) => void
}

export function FinishPicker({ surface, color, finishId, dispatch }: FinishPickerProps) {
  return (
    <fieldset>
      <legend>Finish</legend>
      {Object.keys(builtinFinishes.entries).map((id) => (
        <label key={id}>
          <input
            type="radio"
            name="finish"
            value={id}
            checked={id === finishId}
            onChange={() => dispatch(assignSurfacePaint(surface, color, id))}
          />
          {id}
        </label>
      ))}
    </fieldset>
  )
}
