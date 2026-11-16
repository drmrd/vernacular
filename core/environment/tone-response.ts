import { clampToUnitInterval } from '../color/linear-rgb'
import { linearToSrgb } from '../color/oklab'

/*
 * The AgX tone curve of the pinned three.js build (0.184.0), transcribed from
 * agxToneMapping in node_modules/three/src/nodes/display/ToneMappingFunctions.js.
 * For a neutral input both AgX matrices keep the value, so only the log encoding,
 * the contrast polynomial, and the power 2.2 remain. The conversions to and from
 * Rec. 2020 keep a neutral value to four digits, so they are left out. core must not import three,
 * so the numbers live here as named constants.
 */

/** The darkest exposure value, in stops, that the curve distinguishes. */
const AGX_MIN_EV = -12.47393
/** The brightest exposure value, in stops, that the curve distinguishes. */
const AGX_MAX_EV = 4.026069
/** The floor applied before the logarithm so zero input stays finite. */
const AGX_LINEAR_FLOOR = 1e-10
/** The power that turns the polynomial output into linear light. */
const AGX_OUTPUT_POWER = 2.2

/* Coefficients of the sixth-degree contrast polynomial, named by the power each multiplies. */
const CONTRAST_DEGREE_6 = 15.5
const CONTRAST_DEGREE_5 = -40.14
const CONTRAST_DEGREE_4 = 31.96
const CONTRAST_DEGREE_3 = -6.868
const CONTRAST_DEGREE_2 = 0.4298
const CONTRAST_DEGREE_1 = 0.1191
const CONTRAST_DEGREE_0 = -0.00232

/** The contrast coefficients, highest degree first. */
const AGX_CONTRAST_COEFFICIENTS: readonly number[] = [
  CONTRAST_DEGREE_6,
  CONTRAST_DEGREE_5,
  CONTRAST_DEGREE_4,
  CONTRAST_DEGREE_3,
  CONTRAST_DEGREE_2,
  CONTRAST_DEGREE_1,
  CONTRAST_DEGREE_0,
]

/** Bisection steps; each halves the bracket, so this exceeds double precision for any bracket here. */
const INVERSE_ITERATION_COUNT = 60
/** The largest linear input the inverse searches; the curve is saturated well before it. */
const INVERSE_SEARCH_CEILING = 64

function contrast(position: number): number {
  return AGX_CONTRAST_COEFFICIENTS.reduce((total, coefficient) => total * position + coefficient, 0)
}

/** The display-encoded value, 0 to 1, of a neutral linear input at exposure 1. */
export function agxNeutralResponse(linear: number): number {
  const stops = Math.log2(Math.max(linear, AGX_LINEAR_FLOOR))
  const position = clampToUnitInterval((stops - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV))
  const outputLinear = clampToUnitInterval(
    Math.pow(Math.max(0, contrast(position)), AGX_OUTPUT_POWER),
  )
  return linearToSrgb(outputLinear)
}

/** The neutral linear input whose response is the given display-encoded value, by bisection. */
export function agxNeutralInverse(encoded: number): number {
  let low = 0
  let high = INVERSE_SEARCH_CEILING
  for (let step = 0; step < INVERSE_ITERATION_COUNT; step += 1) {
    const middle = (low + high) / 2
    if (agxNeutralResponse(middle) < encoded) {
      low = middle
    } else {
      high = middle
    }
  }
  return (low + high) / 2
}
