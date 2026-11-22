import type { ReactElement } from 'react'
import type { Command, EnvironmentState, OpeningLight } from '../../core'
import {
  clearOpeningLight,
  DEFAULT_CLOUD_COVER,
  formatObservationDateTime,
  isObservationInstantIso,
  observationInstantToIso,
  parseObservationInstant,
  setOpeningLight,
} from '../../core'
import { Button, Stack } from '../design-system'

export interface OpeningLightControlProps {
  environment: EnvironmentState
  openingLight: OpeningLight | undefined
  dispatch: (command: Command) => void
}

const DEFAULT_LIGHT_STATUS = 'Opens in the default light.'
const PERCENT_PER_UNIT = 100
const CLOCK_START = 11
const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function cloudCoverWording(cloudCover: number): string {
  if (cloudCover === 0) return 'clear sky'
  if (cloudCover === 1) return 'overcast sky'
  return `${Math.round(cloudCover * PERCENT_PER_UNIT)}% cloud cover`
}

// A malformed stored light is ignored at open, so the status reads the default light.
function statusWording(openingLight: OpeningLight | undefined): string {
  if (openingLight === undefined || !isObservationInstantIso(openingLight.observedAt)) {
    return DEFAULT_LIGHT_STATUS
  }
  const instant = parseObservationInstant(openingLight.observedAt)
  const day = DAY_FORMAT.format(new Date(`${instant.date}T00:00:00Z`))
  const clock = formatObservationDateTime(instant).slice(CLOCK_START)
  const cloudCover = openingLight.weather?.cloudCover ?? DEFAULT_CLOUD_COVER
  return `Opens at ${day}, ${clock}, ${cloudCoverWording(cloudCover)}.`
}

export function OpeningLightControl({
  environment,
  openingLight,
  dispatch,
}: OpeningLightControlProps): ReactElement {
  const store = () =>
    dispatch(
      setOpeningLight({
        observedAt: observationInstantToIso(environment.observedAt),
        weather: { cloudCover: environment.cloudCover },
      }),
    )
  return (
    <Stack>
      <p role="status">{statusWording(openingLight)}</p>
      <Button onClick={store}>Use this light when the project opens</Button>
      <Button disabled={openingLight === undefined} onClick={() => dispatch(clearOpeningLight())}>
        Clear the opening light
      </Button>
    </Stack>
  )
}
