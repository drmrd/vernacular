import { MINUTES_PER_DAY, type ObservationInstant } from './observation-time'

/**
 * Where and when the sun is observed. Latitude is in decimal degrees, north
 * positive; longitude is in decimal degrees, east positive. The observation
 * instant is civil (wall-clock) time at the site, and `utcOffsetMinutes` maps
 * it to UTC: local civil time = UTC + offset (for example -300 for UTC-5).
 */
export interface SolarPositionInput {
  /** Site latitude in decimal degrees, north positive. */
  readonly latitude: number
  /** Site longitude in decimal degrees, east positive. */
  readonly longitude: number
  /** The civil date and wall-clock minutes the scene is observed at. */
  readonly observedAt: ObservationInstant
  /** Offset from UTC in minutes; local civil time = UTC + this offset. */
  readonly utcOffsetMinutes: number
}

/**
 * The sun's direction in the local horizontal frame, in radians. Azimuth is
 * measured clockwise from true north (0 north, pi/2 east, pi south). Altitude
 * is the geometric angle above the horizon, with no atmospheric-refraction
 * correction, so it goes negative once the sun is below the horizon.
 */
export interface SolarAngles {
  /** Radians clockwise from true north. */
  readonly azimuth: number
  /** Geometric radians above the horizon; negative below it. */
  readonly altitude: number
}

const HALF_TURN_DEGREES = 180
const FULL_TURN_DEGREES = 2 * HALF_TURN_DEGREES
const FULL_TURN_RADIANS = 2 * Math.PI
const QUARTER_TURN_RADIANS = Math.PI / 2
/** Earth turns a full circle of longitude per civil day: four minutes per degree. */
const MINUTES_PER_DEGREE_OF_ROTATION = MINUTES_PER_DAY / FULL_TURN_DEGREES

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / HALF_TURN_DEGREES
}

function toDegrees(radians: number): number {
  return (radians * HALF_TURN_DEGREES) / Math.PI
}

/** Guards `Math.acos` against floating-point drift just past the unit interval. */
function clampCosine(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

/**
 * How close `|cos(zenith)|` may get to 1 before the sun counts as directly
 * overhead or underfoot, where the azimuth denominator `sin(zenith)` vanishes.
 */
const ZENITH_ALIGNMENT_COSINE_EPSILON = 1e-12

interface SunGeometry {
  readonly declinationDegrees: number
  readonly equationOfTimeMinutes: number
}

/* eslint-disable no-magic-numbers -- published astronomical formulas from the NOAA
   solar calculator (https://gml.noaa.gov/grad/solcalc/): the Gregorian-calendar
   Julian Day formula, the J2000 epoch and century length, the solar-orbit series
   (mean longitude, mean anomaly, eccentricity, equation of center), the obliquity
   series, and the equation-of-time terms; documented coefficients, not
   unexplained numbers. */

/** Julian Day for a `YYYY-MM-DD` civil date plus minutes since midnight UTC. */
function julianDay(date: string, utcMinutesSinceMidnight: number): number {
  const [yearField = 0, monthField = 0, day = 0] = date.split('-').map(Number)
  const monthShifted = monthField <= 2
  const year = monthShifted ? yearField - 1 : yearField
  const month = monthShifted ? monthField + 12 : monthField
  const century = Math.floor(year / 100)
  const gregorianCorrection = 2 - century + Math.floor(century / 4)
  return (
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    utcMinutesSinceMidnight / MINUTES_PER_DAY +
    gregorianCorrection -
    1524.5
  )
}

function julianCenturiesSinceJ2000(day: number): number {
  return (day - 2451545) / 36525
}

/** Solar declination (degrees) and the equation of time (minutes) at a Julian-century epoch. */
function sunGeometry(t: number): SunGeometry {
  const meanLongitude = (280.46646 + t * (36000.76983 + t * 0.0003032)) % FULL_TURN_DEGREES
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const orbitEccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  const equationOfCenter =
    Math.sin(toRadians(meanAnomaly)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(toRadians(2 * meanAnomaly)) * (0.019993 - 0.000101 * t) +
    Math.sin(toRadians(3 * meanAnomaly)) * 0.000289
  const trueLongitude = meanLongitude + equationOfCenter
  const moonNodeLongitude = 125.04 - 1934.136 * t
  const apparentLongitude =
    trueLongitude - 0.00569 - 0.00478 * Math.sin(toRadians(moonNodeLongitude))
  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliquity = meanObliquity + 0.00256 * Math.cos(toRadians(moonNodeLongitude))
  const declinationDegrees = toDegrees(
    Math.asin(Math.sin(toRadians(obliquity)) * Math.sin(toRadians(apparentLongitude))),
  )
  const obliquityFactor = Math.tan(toRadians(obliquity / 2)) ** 2
  const equationOfTimeMinutes =
    4 *
    toDegrees(
      obliquityFactor * Math.sin(2 * toRadians(meanLongitude)) -
        2 * orbitEccentricity * Math.sin(toRadians(meanAnomaly)) +
        4 *
          orbitEccentricity *
          obliquityFactor *
          Math.sin(toRadians(meanAnomaly)) *
          Math.cos(2 * toRadians(meanLongitude)) -
        0.5 * obliquityFactor ** 2 * Math.sin(4 * toRadians(meanLongitude)) -
        1.25 * orbitEccentricity ** 2 * Math.sin(2 * toRadians(meanAnomaly)),
    )
  return { declinationDegrees, equationOfTimeMinutes }
}
/* eslint-enable no-magic-numbers */

/** Minutes past local solar midnight, folding the equation of time and longitude in. */
function trueSolarTimeMinutes(input: SolarPositionInput, equationOfTimeMinutes: number): number {
  const raw =
    input.observedAt.minutesSinceMidnight +
    equationOfTimeMinutes +
    MINUTES_PER_DEGREE_OF_ROTATION * input.longitude -
    input.utcOffsetMinutes
  return ((raw % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

/** Hour angle in degrees: zero at local solar noon, negative before it. */
function hourAngleDegrees(trueSolarTime: number): number {
  const degrees = trueSolarTime / MINUTES_PER_DEGREE_OF_ROTATION - HALF_TURN_DEGREES
  return degrees < -HALF_TURN_DEGREES ? degrees + FULL_TURN_DEGREES : degrees
}

/**
 * Resolves the horizontal-frame angles from latitude, declination, and hour
 * angle (degrees). When the sun sits at the zenith or nadir the azimuth is
 * conventionally undefined; this returns 0 (true north) for stability instead
 * of dividing by the vanishing `sin(zenith)`.
 */
function horizontalAngles(
  latitudeDegrees: number,
  declinationDegrees: number,
  hourAngle: number,
): SolarAngles {
  const latitude = toRadians(latitudeDegrees)
  const declination = toRadians(declinationDegrees)
  const zenithCosine = clampCosine(
    Math.sin(latitude) * Math.sin(declination) +
      Math.cos(latitude) * Math.cos(declination) * Math.cos(toRadians(hourAngle)),
  )
  const zenith = Math.acos(zenithCosine)
  if (1 - Math.abs(zenithCosine) < ZENITH_ALIGNMENT_COSINE_EPSILON) {
    return { azimuth: 0, altitude: QUARTER_TURN_RADIANS - zenith }
  }
  const azimuthCosine =
    (Math.sin(latitude) * Math.cos(zenith) - Math.sin(declination)) /
    (Math.cos(latitude) * Math.sin(zenith))
  const azimuthFromSouth = Math.acos(clampCosine(azimuthCosine))
  const azimuth =
    hourAngle > 0
      ? (azimuthFromSouth + Math.PI) % FULL_TURN_RADIANS
      : (FULL_TURN_RADIANS + Math.PI - azimuthFromSouth) % FULL_TURN_RADIANS
  return { azimuth, altitude: QUARTER_TURN_RADIANS - zenith }
}

/**
 * Computes the sun's direction for a site and a civil observation instant using
 * the NOAA solar calculator formulas. Returns radians: azimuth clockwise from
 * true north, and geometric altitude above the horizon with no
 * atmospheric-refraction correction (negative once the sun has set). With the
 * sun effectively at the zenith or nadir the azimuth is undefined, and this
 * function returns 0 by convention.
 */
export function solarPosition(input: SolarPositionInput): SolarAngles {
  const utcMinutesSinceMidnight = input.observedAt.minutesSinceMidnight - input.utcOffsetMinutes
  const epoch = julianCenturiesSinceJ2000(julianDay(input.observedAt.date, utcMinutesSinceMidnight))
  const { declinationDegrees, equationOfTimeMinutes } = sunGeometry(epoch)
  const hourAngle = hourAngleDegrees(trueSolarTimeMinutes(input, equationOfTimeMinutes))
  return horizontalAngles(input.latitude, declinationDegrees, hourAngle)
}
