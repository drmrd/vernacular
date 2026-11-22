import type { ReactElement } from 'react'
import type { Command, EnvironmentState, OpeningLight } from '../../core'
import {
  clearOpeningLight,
  formatObservationTime,
  setOpeningLight,
  storedOpeningConditions,
  viewingConditionsOf,
} from '../../core'
import { Button, Stack } from '../design-system'

export interface OpeningLightControlProps {
  environment: EnvironmentState
  openingLight: OpeningLight | undefined
  dispatch: (command: Command) => void
}

const DEFAULT_LIGHT_STATUS = 'Opens in the default light.'
const PERCENT = 100
const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function cloudCoverWording(cloudCover: number): string {
  if (cloudCover === 0) return 'clear sky'
  if (cloudCover === 1) return 'overcast sky'
  return `${Math.round(cloudCover * PERCENT)}% cloud cover`
}

// The status states the light the project opens in, by the same rule the opening applies: an
// absent or malformed stored light is ignored, so the status reads the default light.
function statusWording(openingLight: OpeningLight | undefined): string {
  const conditions = storedOpeningConditions(openingLight)
  if (conditions === undefined) return DEFAULT_LIGHT_STATUS
  const { observedAt, cloudCover } = conditions
  const day = DAY_FORMAT.format(new Date(`${observedAt.date}T00:00:00Z`))
  const clock = formatObservationTime(observedAt)
  return `Opens at ${day}, ${clock}, ${cloudCoverWording(cloudCover)}.`
}

export function OpeningLightControl({
  environment,
  openingLight,
  dispatch,
}: OpeningLightControlProps): ReactElement {
  const storeCurrentLight = () => dispatch(setOpeningLight(viewingConditionsOf(environment)))
  return (
    <Stack>
      <p role="status" aria-live="polite">
        {statusWording(openingLight)}
      </p>
      <Button onClick={storeCurrentLight}>Use this light when the project opens</Button>
      <Button disabled={openingLight === undefined} onClick={() => dispatch(clearOpeningLight())}>
        Clear the opening light
      </Button>
    </Stack>
  )
}
