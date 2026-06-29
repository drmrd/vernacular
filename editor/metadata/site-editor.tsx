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
  onCommit: (event: KeyboardEvent<HTMLInputElement>) => void
}

function LabeledNumberInput({ label, value, onValueChange, onCommit }: LabeledNumberInputProps) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onValueChange(event.target.valueAsNumber)}
        onKeyDown={onCommit}
      />
    </label>
  )
}

function commitOnEnter(commit: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit()
    }
  }
}

export function SiteEditor({ site, dispatch }: SiteEditorProps) {
  const [latitude, setLatitude] = useState(site.latLong?.latitude ?? 0)
  const [longitude, setLongitude] = useState(site.latLong?.longitude ?? 0)
  const [bearingDegrees, setBearingDegrees] = useState(
    (site.northBearing ?? 0) / RADIANS_PER_DEGREE,
  )

  const commitLocation = commitOnEnter(() => dispatch(setSiteLocation({ latitude, longitude })))
  const commitBearing = commitOnEnter(() => {
    // A cleared number input reads back as NaN; never commit that as a bearing.
    if (Number.isNaN(bearingDegrees)) {
      return
    }
    dispatch(setSiteNorthBearing(bearingDegrees * RADIANS_PER_DEGREE))
  })

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
