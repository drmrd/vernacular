import {
  removeUnderlay,
  setUnderlayOpacity,
  setUnderlayVisibility,
  type Underlay,
} from '../../core'
import { Button, Field } from '../design-system'

const OPACITY_MIN = 0
const OPACITY_MAX = 1
const OPACITY_STEP = 0.05
const PERCENT = 100

export interface UnderlayPanelProps {
  floorId: string
  underlays: readonly Underlay[]
  dispatch: (command: unknown) => void
  onLoadImage: () => void
  onCalibrate: (underlayId: string) => void
}

export interface UnderlayRowProps {
  floorId: string
  underlay: Underlay
  label: string
  dispatch: (command: unknown) => void
  onCalibrate: (underlayId: string) => void
  calibrating?: boolean
  knownDistance?: string
  onKnownDistanceChange?: (value: string) => void
}

export function UnderlayRow(props: UnderlayRowProps) {
  const { floorId, underlay, label, dispatch, onCalibrate } = props
  const opacityInputId = `underlay-opacity-${underlay.id}`
  const visibleInputId = `underlay-visible-${underlay.id}`
  return (
    <fieldset>
      <legend>{label}</legend>
      <Field htmlFor={opacityInputId} label="Opacity">
        <input
          id={opacityInputId}
          type="range"
          min={OPACITY_MIN}
          max={OPACITY_MAX}
          step={OPACITY_STEP}
          value={underlay.opacity}
          onChange={(event) =>
            dispatch(setUnderlayOpacity(floorId, underlay.id, Number(event.target.value)))
          }
        />
        <span aria-hidden="true">{Math.round(underlay.opacity * PERCENT)}%</span>
      </Field>
      <Field htmlFor={visibleInputId} label="Visible">
        <input
          id={visibleInputId}
          type="checkbox"
          checked={underlay.visible}
          onChange={() => dispatch(setUnderlayVisibility(floorId, underlay.id, !underlay.visible))}
        />
      </Field>
      <Button onClick={() => onCalibrate(underlay.id)}>Calibrate</Button>
      {props.calibrating ? <CalibrationDistanceEntry {...props} /> : null}
      <Button onClick={() => dispatch(removeUnderlay(floorId, underlay.id))}>Remove</Button>
    </fieldset>
  )
}

function CalibrationDistanceEntry({
  underlay,
  knownDistance,
  onKnownDistanceChange,
}: UnderlayRowProps) {
  const distanceInputId = `underlay-distance-${underlay.id}`

  return (
    <>
      <Field htmlFor={distanceInputId} label="Known distance">
        <input
          id={distanceInputId}
          type="text"
          value={knownDistance ?? ''}
          onChange={(event) => onKnownDistanceChange?.(event.target.value)}
        />
      </Field>
      <p>Set a known distance to scale the image</p>
    </>
  )
}
