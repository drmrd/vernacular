import { useState, type KeyboardEvent } from 'react'
import { setSiteLocation, setSiteNorthBearing, type Command, type Site } from '../../core'
import { Stack } from '../design-system'

// Name the per-degree scalar so the no-magic-numbers lint rule stays quiet.
const DEGREES_PER_HALF_TURN = 180
const RADIANS_PER_DEGREE = Math.PI / DEGREES_PER_HALF_TURN

export interface SiteEditorProps {
  site: Site
  dispatch: (command: Command) => void
}

interface LabeledNumberInputProps {
  label: string
  value: number
  onValueChange: (value: number) => void
  onCommit: () => void
}

function LabeledNumberInput({ label, value, onValueChange, onCommit }: LabeledNumberInputProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // A cleared number input reads back as NaN; never commit an empty field.
    if (event.key === 'Enter' && !Number.isNaN(value)) {
      onCommit()
    }
  }
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onValueChange(event.target.valueAsNumber)}
        onKeyDown={handleKeyDown}
      />
    </label>
  )
}

export function SiteEditor({ site, dispatch }: SiteEditorProps) {
  const [latitude, setLatitude] = useState(site.latLong?.latitude ?? 0)
  const [longitude, setLongitude] = useState(site.latLong?.longitude ?? 0)
  const [bearingDegrees, setBearingDegrees] = useState(
    (site.northBearing ?? 0) / RADIANS_PER_DEGREE,
  )

  const commitLocation = () => {
    // Both coordinates dispatch together, so guard the partner field that the
    // committing input cannot see for itself.
    if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
      dispatch(setSiteLocation({ latitude, longitude }))
    }
  }
  const commitBearing = () => dispatch(setSiteNorthBearing(bearingDegrees * RADIANS_PER_DEGREE))

  return (
    <Stack>
      <LabeledNumberInput
        label="Latitude"
        value={latitude}
        onValueChange={setLatitude}
        onCommit={commitLocation}
      />
      <LabeledNumberInput
        label="Longitude"
        value={longitude}
        onValueChange={setLongitude}
        onCommit={commitLocation}
      />
      <LabeledNumberInput
        label="North bearing (degrees)"
        value={bearingDegrees}
        onValueChange={setBearingDegrees}
        onCommit={commitBearing}
      />
    </Stack>
  )
}
