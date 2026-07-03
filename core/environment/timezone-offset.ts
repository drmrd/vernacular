const MINUTES_PER_HOUR = 60
const NOON_HOUR_UTC = 12
/** The fallback offset (UTC itself) for an undefined or unrecognized timezone id. */
const UTC_OFFSET_MINUTES = 0

/**
 * The localized GMT offset token `Intl` emits for `timeZoneName: 'longOffset'`
 * in the `en-US` locale: `GMT-04:00`, `GMT+05:30`, or a bare `GMT` for UTC.
 */
const GMT_OFFSET_PATTERN = /^GMT(?:([+-])(\d{1,2}):(\d{2}))?$/

function parseGmtOffsetMinutes(token: string): number | undefined {
  const match = GMT_OFFSET_PATTERN.exec(token)
  if (match === null) return undefined
  const [, sign, hours = '0', minutes = '0'] = match
  if (sign === undefined) return UTC_OFFSET_MINUTES
  const magnitude = Number(hours) * MINUTES_PER_HOUR + Number(minutes)
  return sign === '-' ? -magnitude : magnitude
}

/** Throws a `RangeError` when the timezone id is not one the host recognizes. */
function gmtOffsetTokenAt(timezone: string, instant: Date): string | undefined {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  }).formatToParts(instant)
  return parts.find((part) => part.type === 'timeZoneName')?.value
}

/**
 * Resolves an IANA timezone id to its UTC offset in minutes on a `YYYY-MM-DD`
 * civil date, where local civil time = UTC + offset (for example -240 for
 * eastern daylight time, 330 for a half-hour zone). The offset is sampled at
 * 12:00 UTC on the date, which matches the date's local-noon offset except
 * within a few hours of a DST-transition instant. Returns the UTC fallback of 0
 * for an undefined or unrecognized timezone id instead of throwing, and uses
 * only the built-in `Intl` machinery, so `core` takes no timezone-database
 * dependency.
 */
export function utcOffsetMinutesFor(timezone: string | undefined, date: string): number {
  if (timezone === undefined) return UTC_OFFSET_MINUTES
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const instant = new Date(Date.UTC(year, month - 1, day, NOON_HOUR_UTC))
  try {
    const token = gmtOffsetTokenAt(timezone, instant)
    if (token === undefined) return UTC_OFFSET_MINUTES
    return parseGmtOffsetMinutes(token) ?? UTC_OFFSET_MINUTES
  } catch {
    return UTC_OFFSET_MINUTES
  }
}
