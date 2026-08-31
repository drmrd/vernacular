import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
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

interface PendingEditCommitOptions {
  // Whether the field's current value may be dispatched at all; number
  // fields pass false while cleared so an empty field never commits.
  isCommittable: boolean
  applyChange: (event: ChangeEvent<HTMLInputElement>) => void
  onCommit: () => void
}

// Enter and blur both commit, but only an edit the user actually made. A ref
// tracks whether an uncommitted edit is pending: set on value change, cleared
// by any commit. Blur without a pending edit is a no-op, which keeps an
// untouched field's focus traversal from re-dispatching its unchanged value
// and keeps a blur right after Enter from dispatching the same value twice.
// Returning a single spreadable handlers object means a field wires the
// change, Enter, and blur paths together or not at all.
function useCommitOnBlur({ isCommittable, applyChange, onCommit }: PendingEditCommitOptions) {
  const hasPendingEditRef = useRef(false)
  const commitPendingEdit = () => {
    onCommit()
    hasPendingEditRef.current = false
  }
  return {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      applyChange(event)
      hasPendingEditRef.current = true
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      // Enter is the explicit accelerator: it commits even without a pending
      // edit, so a user can deliberately re-dispatch the shown value.
      if (event.key === 'Enter' && isCommittable) {
        commitPendingEdit()
      }
    },
    onBlur: () => {
      if (hasPendingEditRef.current && isCommittable) {
        commitPendingEdit()
      }
    },
  }
}

interface LabeledNumberInputProps {
  label: string
  value: number
  onValueChange: (value: number) => void
  onCommit: () => void
}

function LabeledNumberInput({ label, value, onValueChange, onCommit }: LabeledNumberInputProps) {
  // An explicit id/htmlFor association, not just the wrapping <label>, is what
  // VoiceOver needs to announce the field's name (#576).
  const id = useId()
  const commitHandlers = useCommitOnBlur({
    // A cleared number input reads back as NaN; never commit an empty field.
    isCommittable: !Number.isNaN(value),
    applyChange: (event) => onValueChange(event.target.valueAsNumber),
    onCommit,
  })
  return (
    <label htmlFor={id}>
      {label}
      <input id={id} type="number" value={value} {...commitHandlers} />
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
  // Same explicit association as LabeledNumberInput, for the same reason (#576).
  const id = useId()
  const commitHandlers = useCommitOnBlur({
    isCommittable: true,
    applyChange: (event) => onValueChange(event.target.value),
    onCommit,
  })
  return (
    <label htmlFor={id}>
      {label}
      <input id={id} type="text" value={value} {...commitHandlers} />
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
