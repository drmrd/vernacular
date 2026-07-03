const MINUTES_PER_HOUR = 60
const NOON_HOUR_UTC = 12
/** The fallback offset (UTC itself) for an undefined or unrecognized timezone id. */
const UTC_OFFSET_MINUTES = 0
/** The Earth turns 15 degrees of longitude per hour of solar time. */
const DEGREES_PER_HOUR_OF_LONGITUDE = 15

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

function fallbackOffsetMinutes(fallbackLongitude: number | undefined): number {
  if (fallbackLongitude === undefined) return UTC_OFFSET_MINUTES
  return Math.round(fallbackLongitude / DEGREES_PER_HOUR_OF_LONGITUDE) * MINUTES_PER_HOUR
}

/**
 * Resolves an IANA timezone id to its UTC offset in minutes on a `YYYY-MM-DD`
 * civil date, where local civil time = UTC + offset (for example -240 for
 * eastern daylight time, 330 for a half-hour zone). The offset is sampled at
 * 12:00 UTC on the date, which matches the date's local-noon offset except
 * within a few hours of a DST-transition instant. Uses only the built-in
 * `Intl` machinery, so `core` takes no timezone-database dependency.
 *
 * A site that has not recorded a timezone (or one whose stored id the host
 * no longer recognizes) still needs a usable sun position: `fallbackLongitude`
 * (degrees, east positive, matching `Site.latLong.longitude`) lets the caller
 * supply a solar-time estimate of `longitude / 15` hours instead of UTC, which
 * keeps sun angles roughly right without a real timezone lookup. Without a
 * `fallbackLongitude`, or when the timezone id resolves, this returns the
 * timezone's own offset (or 0, unchanged from before this parameter existed).
 * The environment panel is responsible for surfacing a notice that points the
 * user at the Site panel to record a timezone when this fallback is in play.
 *
 * Layer placement: the slice-1a plan sketched this resolution "at the boundary"
 * (the bridge), but it lives in core deliberately. The plan's locked decision
 * guards against a bundled timezone-data dependency, and `Intl` is a
 * zero-dependency ECMA-402 built-in that runs identically under Node, so the
 * resolution is unit-testable here and every caller shares one implementation.
 * ADR-0144 records the deviation.
 */
export function utcOffsetMinutesFor(
  timezone: string | undefined,
  date: string,
  fallbackLongitude?: number,
): number {
  if (timezone === undefined) return fallbackOffsetMinutes(fallbackLongitude)
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const instant = new Date(Date.UTC(year, month - 1, day, NOON_HOUR_UTC))
  let token: string | undefined
  try {
    token = gmtOffsetTokenAt(timezone, instant)
  } catch {
    return fallbackOffsetMinutes(fallbackLongitude)
  }
  if (token === undefined) return fallbackOffsetMinutes(fallbackLongitude)
  return parseGmtOffsetMinutes(token) ?? fallbackOffsetMinutes(fallbackLongitude)
}
