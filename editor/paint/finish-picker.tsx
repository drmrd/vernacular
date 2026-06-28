import {
  assignSurfacePaint,
  assignSurfaceTreatment,
  builtinFinishes,
  builtinFloorPatterns,
  patternTreatment,
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

/** Render a hyphenated registry id as a human-readable Title-Case label. */
function titleCaseId(id: string): string {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-')
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
          {titleCaseId(id)}
        </label>
      ))}
    </fieldset>
  )
}

export interface FloorPatternPickerProps {
  surface: SurfaceRef
  /** The currently assigned pattern id, or undefined when the floor carries no pattern. */
  patternId: string | undefined
  dispatch: (command: Command) => void
}

/** Pick a floor wearing-surface material (wood plank, tile, parquet) for the selected floor. */
export function FloorPatternPicker({ surface, patternId, dispatch }: FloorPatternPickerProps) {
  return (
    <fieldset>
      <legend>Floor pattern</legend>
      {Object.values(builtinFloorPatterns.entries).map((pattern) => (
        <label key={pattern.id}>
          <input
            type="radio"
            name="floor-pattern"
            value={pattern.id}
            checked={pattern.id === patternId}
            onChange={() =>
              dispatch(
                assignSurfaceTreatment(
                  surface,
                  patternTreatment(pattern.id, pattern.scale, pattern.colors),
                ),
              )
            }
          />
          {titleCaseId(pattern.id)}
        </label>
      ))}
    </fieldset>
  )
}
