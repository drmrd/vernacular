// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const ADR_0192_BOUNCE_LUMINANCE = 0.21174
const BOUNCE_PIN_TOLERANCE = 0.00001
const FORBIDDEN_FUNCTIONS = ['random', 'pow']

function linearMean(pixels) {
  const texelCount = pixels.length / CHANNELS.length
  const sums = Object.fromEntries(CHANNELS.map((channel) => [channel, 0]))
  for (let index = 0; index < pixels.length; index += 1) {
    sums[CHANNELS[index % CHANNELS.length]] += srgbToLinear(pixels[index] / MAX_CODE)
  }
  return Object.fromEntries(CHANNELS.map((channel) => [channel, sums[channel] / texelCount]))
}

function throwing(name) {
  return () => {
    throw new Error(`${name} must not be used by the grass generator`)
  }
}

const referenceTile = generateGrassTile()

describe('the generated grass tile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has 512 by 512 RGB texels', () => {
    const tile = generateGrassTile()
    expect(tile.width).toBe(TILE_SIZE)
    expect(tile.height).toBe(TILE_SIZE)
    expect(tile.pixels).toHaveLength(TILE_SIZE * TILE_SIZE * CHANNELS.length)
  })

  it('has the lawn color as its mean in linear light', () => {
    const mean = linearMean(generateGrassTile().pixels)
    for (const channel of CHANNELS) {
      expect(
        Math.abs(mean[channel] - GROUND_SURFACE_COLOR[channel]),
        `channel ${channel}`,
      ).toBeLessThanOrEqual(MEAN_TOLERANCE)
    }
  })

  it("has the sky's ground bounce as the luminance of its mean", () => {
    const mean = linearMean(generateGrassTile().pixels)
    expect(Math.abs(linearLuminance(mean) - GROUND_BOUNCE_COLOR.r)).toBeLessThanOrEqual(
      LUMINANCE_TOLERANCE,
    )
  })

  it('pins the ground bounce color to the value ADR-0192 records', () => {
    expect(Math.abs(GROUND_BOUNCE_COLOR.r - ADR_0192_BOUNCE_LUMINANCE)).toBeLessThanOrEqual(
      BOUNCE_PIN_TOLERANCE,
    )
  })

  it('is the same on every run', () => {
    expect(generateGrassTile().pixels).toEqual(referenceTile.pixels)
  })

  describe('with the engine-approximated and time-dependent functions replaced by throwing spies', () => {
    // The spies cannot catch the `**` operator. The byte rebuild test of the starter pack is the
    // full tripwire for bytes that differ across engines.
    beforeEach(() => {
      for (const name of FORBIDDEN_FUNCTIONS) {
        vi.spyOn(Math, name).mockImplementation(throwing(`Math.${name}`))
      }
      vi.spyOn(Date, 'now').mockImplementation(throwing('Date.now'))
    })

    it('builds with no engine-approximated or time-dependent function', () => {
      expect(generateGrassTile().pixels).toEqual(referenceTile.pixels)
    })
  })
})
