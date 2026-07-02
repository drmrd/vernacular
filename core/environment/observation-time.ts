/**
 * A civil (wall-clock) observation moment: the calendar date and the time of day a
 * scene is observed at. Timezone lives on the `Site` (the "where"), not here (the
 * "when"), so a scene's wall-clock time reads the same wherever the project sits.
 * Slice 0 shows this as a readout only; slice 1a combines it with the site latitude,
 * longitude, and timezone to place the sun (ADR-0141).
 */
export interface ObservationInstant {
  /** ISO 8601 calendar date, `YYYY-MM-DD`. */
  readonly date: string
  /** Minutes since local midnight, 0..1439. */
  readonly minutesSinceMidnight: number
}

const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
/** Minutes in a full civil day; the exclusive upper bound for `minutesSinceMidnight`. */
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY

const NOON_HOUR = 12
const NOON_MINUTES = NOON_HOUR * MINUTES_PER_HOUR
/** Summer-solstice noon: a bright, unambiguous default for the readout. */
export const DEFAULT_OBSERVATION_INSTANT: ObservationInstant = {
  date: '2026-06-21',
  minutesSinceMidnight: NOON_MINUTES,
}

const ISO_TIME_RADIX = 10
const ISO_FIELD_WIDTH = 2

function twoDigits(value: number): string {
  return value.toString(ISO_TIME_RADIX).padStart(ISO_FIELD_WIDTH, '0')
}

function hoursAndMinutes(minutesSinceMidnight: number): { hours: number; minutes: number } {
  return {
    hours: Math.floor(minutesSinceMidnight / MINUTES_PER_HOUR),
    minutes: minutesSinceMidnight % MINUTES_PER_HOUR,
  }
}

/** Serializes to an ISO 8601 civil datetime `YYYY-MM-DDThh:mm` (a `datetime-local` value). */
export function observationInstantToIso(instant: ObservationInstant): string {
  const { hours, minutes } = hoursAndMinutes(instant.minutesSinceMidnight)
  return `${instant.date}T${twoDigits(hours)}:${twoDigits(minutes)}`
}

/** Parses an ISO 8601 civil datetime `YYYY-MM-DDThh:mm` back into an `ObservationInstant`. */
export function parseObservationInstant(iso: string): ObservationInstant {
  const [date = '', time = ''] = iso.split('T')
  const [hours = 0, minutes = 0] = time
    .split(':')
    .map((field) => Number.parseInt(field, ISO_TIME_RADIX))
  return { date, minutesSinceMidnight: hours * MINUTES_PER_HOUR + minutes }
}

/** Formats a readable readout `YYYY-MM-DD hh:mm` for the scrubber. */
export function formatObservationDateTime(instant: ObservationInstant): string {
  const { hours, minutes } = hoursAndMinutes(instant.minutesSinceMidnight)
  return `${instant.date} ${twoDigits(hours)}:${twoDigits(minutes)}`
}
