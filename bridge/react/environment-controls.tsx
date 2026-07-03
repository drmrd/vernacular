import {
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
  formatColorTemperature,
  colorTemperatureLabel,
} from '../../core'

const COLOR_TEMPERATURE_STEP_K = 100

/** End captions sourced from core so the warm=low / cool=high convention lives in one place. */
const WARM_CAPTION = capitalize(colorTemperatureLabel(MIN_COLOR_TEMPERATURE_K))
const COOL_CAPTION = capitalize(colorTemperatureLabel(MAX_COLOR_TEMPERATURE_K))

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

interface ColorTemperatureControlProps {
  colorTemperatureK: number
  onColorTemperatureChange: (kelvin: number) => void
}

/**
 * The color-temperature slider with a live Kelvin readout and muted warm/cool end
 * captions. The readout reflects the current value through the core formatter; the slider
 * keeps its existing accessible name and `aria-valuetext` so assistive technology and the
 * scene's e2e coverage continue to resolve it by name.
 */
function ColorTemperatureControl({
  colorTemperatureK,
  onColorTemperatureChange,
}: ColorTemperatureControlProps) {
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
}

/**
 * The environment group: the color-temperature slider, the schematic rig's only session
 * control now that the observation scrubber and the realistic-lighting toggle live in the
 * editor's Environment panel.
 */
export function EnvironmentControls({
  colorTemperatureK,
  onColorTemperatureChange,
}: EnvironmentControlsProps) {
  return (
    <div className="scene-nav-toolbar__environment">
      <ColorTemperatureControl
        colorTemperatureK={colorTemperatureK}
        onColorTemperatureChange={onColorTemperatureChange}
      />
    </div>
  )
}
