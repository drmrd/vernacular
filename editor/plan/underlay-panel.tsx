import {
  removeUnderlay,
  setUnderlayOpacity,
  setUnderlayVisibility,
  type Underlay,
} from '../../core'
import { Button } from '../design-system'

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

interface UnderlayRowProps {
  floorId: string
  underlay: Underlay
  label: string
  dispatch: (command: unknown) => void
  onCalibrate: (underlayId: string) => void
}

function UnderlayRow({ floorId, underlay, label, dispatch, onCalibrate }: UnderlayRowProps) {
  const opacityInputId = `underlay-opacity-${underlay.id}`

  return (
    <fieldset>
      <legend>{label}</legend>
      <label htmlFor={opacityInputId}>Opacity</label>
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
      <label>
        Visible
        <input
          type="checkbox"
          checked={underlay.visible}
          onChange={() => dispatch(setUnderlayVisibility(floorId, underlay.id, !underlay.visible))}
        />
      </label>
      <Button onClick={() => onCalibrate(underlay.id)}>Calibrate</Button>
      <Button onClick={() => dispatch(removeUnderlay(floorId, underlay.id))}>Remove</Button>
    </fieldset>
  )
}

export function UnderlayPanel({
  floorId,
  underlays,
  dispatch,
  onLoadImage,
  onCalibrate,
}: UnderlayPanelProps) {
  return (
    <div>
      <Button onClick={onLoadImage}>Load image</Button>
      {underlays.map((underlay, index) => (
        <UnderlayRow
          key={underlay.id}
          floorId={floorId}
          underlay={underlay}
          label={`Underlay ${index + 1}`}
          dispatch={dispatch}
          onCalibrate={onCalibrate}
        />
      ))}
    </div>
  )
}
