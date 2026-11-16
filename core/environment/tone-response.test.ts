import { describe, expect, it } from 'vitest'
import { agxNeutralInverse, agxNeutralResponse } from './tone-response'

// The tone curve of the pinned three.js build for a neutral input at exposure 1, read
// back as the 8-bit code a display shows.
const CODE_RANGE = 255
const CODE_TOLERANCE = 0.2

const KNOWN_CODES: ReadonlyArray<{ linear: number; code: number }> = [
  { linear: 0.18, code: 127.6 },
  { linear: 0.34, code: 157.2 },
  { linear: 1, code: 201.9 },
  { linear: 2, code: 223.7 },
  { linear: 16, code: 254.5 },
]

const WHITE_CODE_FLOOR = 225
const WHITE_CODE_LINEAR_LEVEL = 2.1
const WHITE_CODE_LEVEL_TOLERANCE = 0.005

const ROUND_TRIP_LINEAR_LEVEL = 0.5
const ROUND_TRIP_TOLERANCE = 1e-4

const SWEEP_LOWEST_LINEAR = 1e-6
const SWEEP_HIGHEST_LINEAR = 64
const SWEEP_STEP_COUNT = 600

function logSpacedSweep(): number[] {
  const ratio = SWEEP_HIGHEST_LINEAR / SWEEP_LOWEST_LINEAR
  return Array.from(
    { length: SWEEP_STEP_COUNT + 1 },
    (_, index) => SWEEP_LOWEST_LINEAR * ratio ** (index / SWEEP_STEP_COUNT),
  )
}

describe('agxNeutralResponse', () => {
  it.each(KNOWN_CODES)('shows code $code for a linear level of $linear', ({ linear, code }) => {
    expect(Math.abs(agxNeutralResponse(linear) * CODE_RANGE - code)).toBeLessThanOrEqual(
      CODE_TOLERANCE,
    )
  })

  it('never decreases as the linear level rises across a wide log-spaced range', () => {
    const responses = logSpacedSweep().map(agxNeutralResponse)
    const drops = responses.filter(
      (response, index) => index > 0 && response < (responses[index - 1] ?? 0),
    )
    expect(drops).toEqual([])
  })
})

describe('agxNeutralInverse', () => {
  it('finds the linear level near 2.1 for the white code floor of 225', () => {
    expect(
      Math.abs(agxNeutralInverse(WHITE_CODE_FLOOR / CODE_RANGE) - WHITE_CODE_LINEAR_LEVEL),
    ).toBeLessThanOrEqual(WHITE_CODE_LEVEL_TOLERANCE)
  })

  it('undoes the response: the inverse of the response of 0.5 is 0.5', () => {
    const recovered = agxNeutralInverse(agxNeutralResponse(ROUND_TRIP_LINEAR_LEVEL))
    expect(Math.abs(recovered - ROUND_TRIP_LINEAR_LEVEL)).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE)
  })
})
