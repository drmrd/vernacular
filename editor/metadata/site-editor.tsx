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

interface SiteFieldsProps {
  latitude: number
  longitude: number
  bearingDegrees: number
  timezone: string
  onLatitudeChange: (value: number) => void
  onLongitudeChange: (value: number) => void
  onBearingChange: (value: number) => void
  onTimezoneChange: (value: string) => void
  commitLocation: () => void
  commitBearing: () => void
  commitTimezone: () => void
}

function SiteFields(props: SiteFieldsProps) {
  return (
    <Stack>
      <LabeledNumberInput
        label="Latitude"
        value={props.latitude}
        onValueChange={props.onLatitudeChange}
        onCommit={props.commitLocation}
      />
      <LabeledNumberInput
        label="Longitude"
        value={props.longitude}
        onValueChange={props.onLongitudeChange}
        onCommit={props.commitLocation}
      />
      <LabeledNumberInput
        label="North bearing (degrees)"
        value={props.bearingDegrees}
        onValueChange={props.onBearingChange}
        onCommit={props.commitBearing}
      />
      <LabeledTextInput
        label="Timezone"
        value={props.timezone}
        onValueChange={props.onTimezoneChange}
        onCommit={props.commitTimezone}
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
      latitude={latitude}
      longitude={longitude}
      bearingDegrees={bearingDegrees}
      timezone={timezone}
      onLatitudeChange={setLatitude}
      onLongitudeChange={setLongitude}
      onBearingChange={setBearingDegrees}
      onTimezoneChange={setTimezone}
      commitLocation={commitLocation}
      commitBearing={commitBearing}
      commitTimezone={commitTimezone}
    />
  )
}
