import {
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
  formatColorTemperature,
  colorTemperatureLabel,
  DEFAULT_OBSERVATION_INSTANT,
  formatObservationDateTime,
  observationInstantToIso,
  parseObservationInstant,
} from '../../core'
import type { ObservationInstant } from '../../core'

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

interface ObservationDateTimeControlProps {
  observationInstant: ObservationInstant
  onObservationChange: (instant: ObservationInstant) => void
}

/**
 * The observation date/time scrubber with a live readout. Session view state only: it shows
 * the instant and reports changes, and does not drive the lighting yet.
 */
function ObservationDateTimeControl({
  observationInstant,
  onObservationChange,
}: ObservationDateTimeControlProps) {
  return (
    <label className="scene-nav-toolbar__observation">
      Observation date and time
      <input
        type="datetime-local"
        value={observationInstantToIso(observationInstant)}
        aria-label="Observation date and time"
        onChange={(event) => onObservationChange(parseObservationInstant(event.target.value))}
      />
      <output className="scene-nav-toolbar__observation-readout">
        {formatObservationDateTime(observationInstant)}
      </output>
    </label>
  )
}

interface EnvironmentControlsProps {
  colorTemperatureK: number
  onColorTemperatureChange: (kelvin: number) => void
  observationInstant?: ObservationInstant | undefined
  onObservationChange?: ((instant: ObservationInstant) => void) | undefined
}

/**
 * The environment group: the color-temperature slider paired with the observation
 * date/time scrubber, gathered into one section of the toolbar. The observation instant
 * and its change handler are optional; this group supplies their session defaults so the
 * toolbar can forward them straight through.
 */
export function EnvironmentControls({
  colorTemperatureK,
  onColorTemperatureChange,
  observationInstant = DEFAULT_OBSERVATION_INSTANT,
  onObservationChange = () => {},
}: EnvironmentControlsProps) {
  return (
    <div className="scene-nav-toolbar__environment">
      <ColorTemperatureControl
        colorTemperatureK={colorTemperatureK}
        onColorTemperatureChange={onColorTemperatureChange}
      />
      <ObservationDateTimeControl
        observationInstant={observationInstant}
        onObservationChange={onObservationChange}
      />
    </div>
  )
}
