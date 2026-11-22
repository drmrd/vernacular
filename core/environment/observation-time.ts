/**
 * A civil (wall-clock) observation moment: the calendar date and the time of day a
 * scene is observed at. Timezone lives on the `Site` (the "where"), not here (the
 * "when"), so a scene's wall-clock time reads the same wherever the project sits.
 * It is read-only for display today; a later extension combines it with the site
 * latitude, longitude, and timezone to place the sun.
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

const DECIMAL_RADIX = 10
const ISO_FIELD_WIDTH = 2

function twoDigits(value: number): string {
  return value.toString(DECIMAL_RADIX).padStart(ISO_FIELD_WIDTH, '0')
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

// The exact shape `observationInstantToIso` produces and `parseObservationInstant`
// expects: `YYYY-MM-DDThh:mm`. Owned here so every caller that needs to guard the
// parse boundary (a UI input, a future importer, ...) validates against the domain's
// own contract instead of re-deriving the shape itself.
const OBSERVATION_INSTANT_ISO_SHAPE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

const FIRST_MONTH_INDEX_OFFSET = 1

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  // A UTC round trip: a date that does not exist (30 Feb, month 13) rolls over into
  // another month, so its month or day no longer matches what was asked for.
  const monthIndex = month - FIRST_MONTH_INDEX_OFFSET
  const probe = new Date(0)
  probe.setUTCFullYear(year, monthIndex, day)
  return probe.getUTCMonth() === monthIndex && probe.getUTCDate() === day
}

function splitNumbers(text: string, separator: string): number[] {
  return text.split(separator).map((field) => Number.parseInt(field, DECIMAL_RADIX))
}

// The single reading of `YYYY-MM-DDThh:mm`, shared by the tolerant parse and the strict
// check. Missing or malformed fields default rather than throw; the strict check guards
// the shape first, so only the tolerant parse ever sees defaults.
function readIsoFields(iso: string) {
  const [date = '', time = ''] = iso.split('T')
  const [year = 0, month = 0, day = 0] = splitNumbers(date, '-')
  const [hours = 0, minutes = 0] = splitNumbers(time, ':')
  return { date, year, month, day, hours, minutes }
}

/**
 * Reports whether `value` has the exact `YYYY-MM-DDThh:mm` shape `parseObservationInstant`
 * expects and names a real calendar instant (a date that exists, hour 0..23, minute 0..59).
 * `parseObservationInstant` itself stays non-validating (it tolerates and defaults malformed
 * input) so callers that need a hard boundary check here first.
 */
export function isObservationInstantIso(value: string): boolean {
  if (!OBSERVATION_INSTANT_ISO_SHAPE.test(value)) return false
  const { year, month, day, hours, minutes } = readIsoFields(value)
  return isRealCalendarDate(year, month, day) && hours < HOURS_PER_DAY && minutes < MINUTES_PER_HOUR
}

/** Parses an ISO 8601 civil datetime `YYYY-MM-DDThh:mm` back into an `ObservationInstant`. */
export function parseObservationInstant(iso: string): ObservationInstant {
  const { date, hours, minutes } = readIsoFields(iso)
  return { date, minutesSinceMidnight: hours * MINUTES_PER_HOUR + minutes }
}

/** Formats the time of day of an instant as `hh:mm`. */
export function formatObservationTime(instant: ObservationInstant): string {
  const { hours, minutes } = hoursAndMinutes(instant.minutesSinceMidnight)
  return `${twoDigits(hours)}:${twoDigits(minutes)}`
}

/** Formats a readable readout `YYYY-MM-DD hh:mm` for the scrubber. */
export function formatObservationDateTime(instant: ObservationInstant): string {
  return `${instant.date} ${formatObservationTime(instant)}`
}
