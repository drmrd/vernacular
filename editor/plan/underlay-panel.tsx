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
}

export function UnderlayRow({ floorId, underlay, label, dispatch, onCalibrate }: UnderlayRowProps) {
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
      <Button onClick={() => dispatch(removeUnderlay(floorId, underlay.id))}>Remove</Button>
    </fieldset>
  )
}
