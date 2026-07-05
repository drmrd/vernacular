import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
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

// Enter and blur both commit, but a blur that immediately follows an Enter
// which already committed must not dispatch the same value twice. A ref
// tracks whether the pending value is Enter-fresh; any edit clears it, since
// an edit means blur now has a new value to commit.
function useCommitOnBlur(onCommit: () => void) {
  const committedByEnterRef = useRef(false)
  const noteValueChanged = () => {
    committedByEnterRef.current = false
  }
  const commitOnEnter = () => {
    onCommit()
    committedByEnterRef.current = true
  }
  const commitOnBlur = () => {
    if (committedByEnterRef.current) {
      committedByEnterRef.current = false
      return
    }
    onCommit()
  }
  return { noteValueChanged, commitOnEnter, commitOnBlur }
}

interface LabeledNumberInputProps {
  label: string
  value: number
  onValueChange: (value: number) => void
  onCommit: () => void
}

function LabeledNumberInput({ label, value, onValueChange, onCommit }: LabeledNumberInputProps) {
  const { noteValueChanged, commitOnEnter, commitOnBlur } = useCommitOnBlur(onCommit)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(event.target.valueAsNumber)
    noteValueChanged()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // A cleared number input reads back as NaN; never commit an empty field.
    if (event.key === 'Enter' && !Number.isNaN(value)) {
      commitOnEnter()
    }
  }
  const handleBlur = () => {
    // A cleared number input reads back as NaN; never commit an empty field.
    if (!Number.isNaN(value)) {
      commitOnBlur()
    }
  }
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
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
  const { noteValueChanged, commitOnEnter, commitOnBlur } = useCommitOnBlur(onCommit)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(event.target.value)
    noteValueChanged()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commitOnEnter()
    }
  }
  return (
    <label>
      {label}
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={commitOnBlur}
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
