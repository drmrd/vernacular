// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { linearLuminance } from '../../../core/color/contrast.ts'
import { srgbToLinear } from '../../../core/color/oklab.ts'
import {
  GROUND_BOUNCE_COLOR,
  GROUND_SURFACE_COLOR,
} from '../../../core/environment/ground-surface.ts'
import { generateGrassTile } from './grass-tile.mjs'

const TILE_SIZE = 512
const CHANNELS = ['r', 'g', 'b']
const MAX_CODE = 255
const MEAN_TOLERANCE = 0.002
const LUMINANCE_TOLERANCE = 0.0005
// Three full tiles under coverage instrumentation take longer than the 5 second default.
const THREE_TILE_TIMEOUT_MS = 30_000
const BOUNCE_LUMINANCE = 0.21174
const BOUNCE_PIN_TOLERANCE = 0.00001
const FORBIDDEN_FUNCTIONS = ['random', 'pow']

function linearMean(pixels) {
  const texelCount = pixels.length / CHANNELS.length
  const sums = [0, 0, 0]
  for (let index = 0; index < pixels.length; index += 1) {
    sums[index % CHANNELS.length] += srgbToLinear(pixels[index] / MAX_CODE)
  }
  return { r: sums[0] / texelCount, g: sums[1] / texelCount, b: sums[2] / texelCount }
}

function generateWithForbiddenFunctionsStubbed() {
  const thrower = (name) => () => {
    throw new Error(`${name} must not be used by the grass generator`)
  }
  for (const name of FORBIDDEN_FUNCTIONS) {
    vi.spyOn(Math, name).mockImplementation(thrower(`Math.${name}`))
  }
  vi.spyOn(Date, 'now').mockImplementation(thrower('Date.now'))
  try {
    return generateGrassTile()
  } finally {
    vi.restoreAllMocks()
  }
}

describe('the generated grass tile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("has a mean in linear light equal to the lawn color, and a luminance equal to the sky's ground bounce", () => {
    const tile = generateGrassTile()
    expect(tile.width).toBe(TILE_SIZE)
    expect(tile.height).toBe(TILE_SIZE)
    expect(tile.pixels).toHaveLength(TILE_SIZE * TILE_SIZE * CHANNELS.length)

    const mean = linearMean(tile.pixels)
    for (const channel of CHANNELS) {
      expect(
        Math.abs(mean[channel] - GROUND_SURFACE_COLOR[channel]),
        `channel ${channel}`,
      ).toBeLessThanOrEqual(MEAN_TOLERANCE)
    }
    expect(Math.abs(linearLuminance(mean) - GROUND_BOUNCE_COLOR.r)).toBeLessThanOrEqual(
      LUMINANCE_TOLERANCE,
    )
    expect(Math.abs(GROUND_BOUNCE_COLOR.r - BOUNCE_LUMINANCE)).toBeLessThanOrEqual(
      BOUNCE_PIN_TOLERANCE,
    )
  })

  it(
    'is the same on every run and uses no engine-approximated or time-dependent function',
    () => {
      const stubbed = generateWithForbiddenFunctionsStubbed()
      const first = generateGrassTile()
      const second = generateGrassTile()
      expect(second.pixels).toEqual(first.pixels)
      expect(stubbed.pixels).toEqual(first.pixels)
    },
    THREE_TILE_TIMEOUT_MS,
  )
})
