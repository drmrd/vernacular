import type { ChangeEvent, ReactElement } from 'react'
import type { EnvironmentState, LightingMode, ObservationInstant, Site } from '../../core'
import {
  MINUTES_PER_DAY,
  formatObservationDateTime,
  isObservationInstantIso,
  observationInstantToIso,
  parseObservationInstant,
} from '../../core'
import { Field, Segmented, Stack, type SegmentedOption } from '../design-system'

const LIGHTING_MODES: readonly LightingMode[] = ['schematic', 'realistic']

// The last addressable minute of a civil day (`MINUTES_PER_DAY` is the exclusive bound).
const LAST_MINUTE_OF_DAY = MINUTES_PER_DAY - 1
const TIME_OF_DAY_MIN = 0

const CLOUD_COVER_MIN = 0
const CLOUD_COVER_MAX = 1
const CLOUD_COVER_STEP = 0.05
const PERCENT = 100

const LIGHTING_MODE_LABELS: Record<LightingMode, string> = {
  schematic: 'Schematic',
  realistic: 'Realistic',
}

const LIGHTING_MODE_OPTIONS: SegmentedOption[] = LIGHTING_MODES.map((value) => ({
  value,
  label: LIGHTING_MODE_LABELS[value],
}))

function isLightingMode(value: string): value is LightingMode {
  return (LIGHTING_MODES as readonly string[]).includes(value)
}

// Shown when realistic lighting is requested but the site has no coordinates to
// place the sun; the bridge falls back to schematic lighting until they are set.
const MISSING_LOCATION_NOTICE =
  'Realistic lighting needs the site location. Set latitude and longitude in the Site panel; until then the view falls back to schematic lighting.'

// Shown when the site has coordinates but no timezone; solar time is then
// estimated from the longitude alone, which is close but not exact.
const MISSING_TIMEZONE_NOTICE =
  'The site has no timezone, so solar time is estimated from its longitude. Set the timezone in the Site panel for exact sun angles.'

export interface EnvironmentPanelProps {
  site: Site | undefined
  environment: EnvironmentState
  onEnvironmentChange: (next: EnvironmentState) => void
}

interface ObservationControlProps {
  observedAt: ObservationInstant
  onObservationChange: (instant: ObservationInstant) => void
}

function LocationReadout({ site }: { site: Site | undefined }): ReactElement {
  const latLong = site?.latLong
  if (latLong === undefined) {
    return <p>Location: not set</p>
  }
  const zone = site?.timezone === undefined ? '' : `, timezone ${site.timezone}`
  return (
    <p>
      Latitude {latLong.latitude}, longitude {latLong.longitude}
      {zone}
    </p>
  )
}

function EnvironmentNotices({
  mode,
  site,
}: {
  mode: LightingMode
  site: Site | undefined
}): ReactElement | null {
  if (mode !== 'realistic') {
    return null
  }
  if (site?.latLong === undefined) {
    return (
      <p role="status" aria-live="polite">
        {MISSING_LOCATION_NOTICE}
      </p>
    )
  }
  if (site.timezone === undefined) {
    return (
      <p role="status" aria-live="polite">
        {MISSING_TIMEZONE_NOTICE}
      </p>
    )
  }
  return null
}

const OBSERVATION_DATE_TIME_INPUT_ID = 'environment-observation-date-time'
const TIME_OF_DAY_INPUT_ID = 'environment-time-of-day'
const CLOUD_COVER_INPUT_ID = 'environment-cloud-cover'

/** The `hh:mm` portion of `formatObservationDateTime`, for a slider's `aria-valuetext`. */
function formatTimeOfDay(observedAt: ObservationInstant): string {
  const [, time = ''] = formatObservationDateTime(observedAt).split(' ')
  return time
}

/**
 * The observation date/time scrubber. This guards the parse boundary against both a
 * cleared `datetime-local` input (which reports an empty string) and the arbitrary
 * strings a text-fallback input can emit in browsers without native `datetime-local`
 * support; neither is a real instant, so the change is swallowed rather than parsed
 * into a garbage `ObservationInstant`.
 */
function ObservationDateTimeControl({
  observedAt,
  onObservationChange,
}: ObservationControlProps): ReactElement {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    if (!isObservationInstantIso(value)) return
    onObservationChange(parseObservationInstant(value))
  }
  return (
    <Field htmlFor={OBSERVATION_DATE_TIME_INPUT_ID} label="Observation date and time">
      <input
        id={OBSERVATION_DATE_TIME_INPUT_ID}
        type="datetime-local"
        value={observationInstantToIso(observedAt)}
        onChange={handleChange}
      />
      <output>{formatObservationDateTime(observedAt)}</output>
    </Field>
  )
}

/** The time-of-day slider: the same civil date, a different minute of it. */
function TimeOfDaySlider({
  observedAt,
  onObservationChange,
}: ObservationControlProps): ReactElement {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onObservationChange({ date: observedAt.date, minutesSinceMidnight: Number(event.target.value) })
  }
  return (
    <Field htmlFor={TIME_OF_DAY_INPUT_ID} label="Time of day">
      <input
        id={TIME_OF_DAY_INPUT_ID}
        type="range"
        min={TIME_OF_DAY_MIN}
        max={LAST_MINUTE_OF_DAY}
        value={observedAt.minutesSinceMidnight}
        aria-valuetext={formatTimeOfDay(observedAt)}
        onChange={handleChange}
      />
    </Field>
  )
}

interface CloudCoverDialProps {
  cloudCover: number
  onCloudCoverChange: (cloudCover: number) => void
}

/** The cloud-cover dial, with a live percentage readout announced through `aria-valuetext`. */
function CloudCoverDial({ cloudCover, onCloudCoverChange }: CloudCoverDialProps): ReactElement {
  const percent = Math.round(cloudCover * PERCENT)
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onCloudCoverChange(Number(event.target.value))
  }
  return (
    <Field htmlFor={CLOUD_COVER_INPUT_ID} label="Cloud cover">
      <input
        id={CLOUD_COVER_INPUT_ID}
        type="range"
        min={CLOUD_COVER_MIN}
        max={CLOUD_COVER_MAX}
        step={CLOUD_COVER_STEP}
        value={cloudCover}
        aria-valuetext={`${percent}%`}
        onChange={handleChange}
      />
      <output>{percent}%</output>
    </Field>
  )
}

export function EnvironmentPanel({
  site,
  environment,
  onEnvironmentChange,
}: EnvironmentPanelProps): ReactElement {
  const handleModeSelect = (value: string) => {
    if (isLightingMode(value)) onEnvironmentChange({ ...environment, mode: value })
  }
  const handleObservationChange = (observedAt: ObservationInstant) => {
    onEnvironmentChange({ ...environment, observedAt })
  }
  const handleCloudCoverChange = (cloudCover: number) => {
    onEnvironmentChange({ ...environment, cloudCover })
  }
  return (
    <Stack>
      <Segmented
        label="Lighting mode"
        options={LIGHTING_MODE_OPTIONS}
        value={environment.mode}
        onSelect={handleModeSelect}
      />
      <LocationReadout site={site} />
      <EnvironmentNotices mode={environment.mode} site={site} />
      <ObservationDateTimeControl
        observedAt={environment.observedAt}
        onObservationChange={handleObservationChange}
      />
      <TimeOfDaySlider
        observedAt={environment.observedAt}
        onObservationChange={handleObservationChange}
      />
      <CloudCoverDial
        cloudCover={environment.cloudCover}
        onCloudCoverChange={handleCloudCoverChange}
      />
    </Stack>
  )
}
