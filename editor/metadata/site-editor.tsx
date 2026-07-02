import { useState, type KeyboardEvent } from 'react'
import {
  setSiteLocation,
  setSiteNorthBearing,
  setSiteTimezone,
  type Command,
  type Site,
} from '../../core'
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

interface LabeledTextInputProps {
  label: string
  value: string
  onValueChange: (value: string) => void
  onCommit: () => void
}

function LabeledTextInput({ label, value, onValueChange, onCommit }: LabeledTextInputProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      onCommit()
    }
  }
  return (
    <label>
      {label}
      <input
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </label>
  )
}

// A single self-committing field: its current value, a change handler, and the
// commit that fires on Enter.
interface FieldControl<T> {
  value: T
  onValueChange: (value: T) => void
  onCommit: () => void
}

// Latitude and longitude dispatch together, so the two coordinates share one
// commit rather than each carrying its own.
interface LocationControls {
  latitude: number
  longitude: number
  onLatitudeChange: (value: number) => void
  onLongitudeChange: (value: number) => void
  onCommit: () => void
}

interface SiteFieldsProps {
  location: LocationControls
  bearing: FieldControl<number>
  timezone: FieldControl<string>
}

function SiteFields({ location, bearing, timezone }: SiteFieldsProps) {
  return (
    <Stack>
      <LabeledNumberInput
        label="Latitude"
        value={location.latitude}
        onValueChange={location.onLatitudeChange}
        onCommit={location.onCommit}
      />
      <LabeledNumberInput
        label="Longitude"
        value={location.longitude}
        onValueChange={location.onLongitudeChange}
        onCommit={location.onCommit}
      />
      <LabeledNumberInput
        label="North bearing (degrees)"
        value={bearing.value}
        onValueChange={bearing.onValueChange}
        onCommit={bearing.onCommit}
      />
      <LabeledTextInput
        label="Timezone"
        value={timezone.value}
        onValueChange={timezone.onValueChange}
        onCommit={timezone.onCommit}
      />
    </Stack>
  )
}

export function SiteEditor({ site, dispatch }: SiteEditorProps) {
  const [latitude, setLatitude] = useState(site.latLong?.latitude ?? 0)
  const [longitude, setLongitude] = useState(site.latLong?.longitude ?? 0)
  const [bearingDegrees, setBearingDegrees] = useState(
    (site.northBearing ?? 0) / RADIANS_PER_DEGREE,
  )
  const [timezone, setTimezone] = useState(site.timezone ?? '')

  const commitLocation = () => {
    // Both coordinates dispatch together, so guard the partner field that the
    // committing input cannot see for itself.
    if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
      dispatch(setSiteLocation({ latitude, longitude }))
    }
  }
  const commitBearing = () => dispatch(setSiteNorthBearing(bearingDegrees * RADIANS_PER_DEGREE))
  const commitTimezone = () => dispatch(setSiteTimezone(timezone))

  return (
    <SiteFields
      location={{
        latitude,
        longitude,
        onLatitudeChange: setLatitude,
        onLongitudeChange: setLongitude,
        onCommit: commitLocation,
      }}
      bearing={{ value: bearingDegrees, onValueChange: setBearingDegrees, onCommit: commitBearing }}
      timezone={{ value: timezone, onValueChange: setTimezone, onCommit: commitTimezone }}
    />
  )
}
