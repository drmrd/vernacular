import {
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
  formatColorTemperature,
  colorTemperatureLabel,
  type LightingMode,
} from '../../core'

const COLOR_TEMPERATURE_STEP_K = 100

const COLOR_TEMPERATURE_NOTE_ID = 'scene-color-temperature-note'

/**
 * Why the slider is inert, or `null` when it drives the render. The schematic rig is the
 * only one it tints: realistic lighting takes its color from the sun and sky, and the color
 * check overrides both with the neutral reference white (ADR-0142). The mode passed in is
 * the effective one, so a realistic request that fell back to schematic keeps the slider
 * live, which is what that view actually renders.
 */
function colorTemperatureNote(mode: LightingMode, colorCheck: boolean): string | null {
  if (colorCheck) return 'The color check holds the light at the neutral reference white.'
  if (mode === 'realistic') return 'Realistic lighting takes its color from the sun and sky.'
  return null
}

/** End captions sourced from core so the warm=low / cool=high convention lives in one place. */
const WARM_CAPTION = capitalize(colorTemperatureLabel(MIN_COLOR_TEMPERATURE_K))
const COOL_CAPTION = capitalize(colorTemperatureLabel(MAX_COLOR_TEMPERATURE_K))

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

interface ColorTemperatureControlProps {
  colorTemperatureK: number
  onColorTemperatureChange: (kelvin: number) => void
  note: string | null
}

/**
 * The color-temperature slider with a live Kelvin readout and muted warm/cool end
 * captions. The readout reflects the current value through the core formatter; the slider
 * keeps its existing accessible name and `aria-valuetext` so assistive technology and the
 * scene's e2e coverage continue to resolve it by name. A note means the current lighting
 * ignores the value, so the slider goes inert and points at the note that says why.
 */
function ColorTemperatureControl({
  colorTemperatureK,
  onColorTemperatureChange,
  note,
}: ColorTemperatureControlProps) {
  const inert = note !== null
  return (
    <label className="scene-nav-toolbar__temperature">
      Color temperature
      <span className="scene-nav-toolbar__temperature-end">{WARM_CAPTION}</span>
      <input
        type="range"
        min={MIN_COLOR_TEMPERATURE_K}
        max={MAX_COLOR_TEMPERATURE_K}
        step={COLOR_TEMPERATURE_STEP_K}
        value={colorTemperatureK}
        aria-label="Color temperature"
        aria-valuetext={`${colorTemperatureK} kelvin`}
        disabled={inert}
        aria-describedby={inert ? COLOR_TEMPERATURE_NOTE_ID : undefined}
        onChange={(event) => onColorTemperatureChange(Number(event.target.value))}
      />
      <span className="scene-nav-toolbar__temperature-end">{COOL_CAPTION}</span>
      <output className="scene-nav-toolbar__temperature-readout">
        {formatColorTemperature(colorTemperatureK)}
      </output>
    </label>
  )
}

interface EnvironmentControlsProps {
  colorTemperatureK: number
  onColorTemperatureChange: (kelvin: number) => void
  lightingMode: LightingMode
  colorCheck: boolean
}

/**
 * The environment group: the color-temperature slider, the schematic rig's only session
 * control now that the observation scrubber and the realistic-lighting toggle live in the
 * editor's Environment panel. The slider goes inert, with a note saying what is driving the
 * light instead, whenever the current lighting throws its value away.
 */
export function EnvironmentControls({
  colorTemperatureK,
  onColorTemperatureChange,
  lightingMode,
  colorCheck,
}: EnvironmentControlsProps) {
  const note = colorTemperatureNote(lightingMode, colorCheck)
  return (
    <div className="scene-nav-toolbar__environment">
      <ColorTemperatureControl
        colorTemperatureK={colorTemperatureK}
        onColorTemperatureChange={onColorTemperatureChange}
        note={note}
      />
      {note === null ? null : <p id={COLOR_TEMPERATURE_NOTE_ID}>{note}</p>}
    </div>
  )
}
