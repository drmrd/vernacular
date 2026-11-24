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
const MIN_SPREAD_RATIO = 0.05
const MAX_SPREAD_RATIO = 0.2
const FORBIDDEN_FUNCTIONS = ['random', 'pow']
const BLOCK_SIZE = 32
const BLOCK_MEAN_TOLERANCE = 0.01
const MAX_SEAM_STEP_RATIO = 1.1
const MIP_CELL_SIZE = 2
// A tile that cancels neighboring texels would look flat once mipmapped; this keeps the first mip
// level's own spread above a visible floor.
const MIN_FIRST_MIP_SPREAD_RATIO = 0.025
const PERCENT = 100

function linearMean(pixels) {
  const texelCount = pixels.length / CHANNELS.length
  const sums = Object.fromEntries(CHANNELS.map((channel) => [channel, 0]))
  for (let index = 0; index < pixels.length; index += 1) {
    sums[CHANNELS[index % CHANNELS.length]] += srgbToLinear(pixels[index] / MAX_CODE)
  }
  return Object.fromEntries(CHANNELS.map((channel) => [channel, sums[channel] / texelCount]))
}

function texelLuminances(pixels) {
  const luminances = []
  for (let index = 0; index < pixels.length; index += CHANNELS.length) {
    const [r, g, b] = CHANNELS.map((_, offset) => srgbToLinear(pixels[index + offset] / MAX_CODE))
    luminances.push(linearLuminance({ r, g, b }))
  }
  return luminances
}

function meanOf(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function worstBlockDeviation(luminances) {
  const tileMean = meanOf(luminances)
  const blocksPerAxis = TILE_SIZE / BLOCK_SIZE
  const sums = new Array(blocksPerAxis * blocksPerAxis).fill(0)
  luminances.forEach((value, index) => {
    const column = index % TILE_SIZE
    const row = Math.floor(index / TILE_SIZE)
    const block = Math.floor(row / BLOCK_SIZE) * blocksPerAxis + Math.floor(column / BLOCK_SIZE)
    sums[block] += value
  })
  let worst = { deviation: 0, block: 0 }
  sums.forEach((sum, block) => {
    const deviation = Math.abs(sum / (BLOCK_SIZE * BLOCK_SIZE) - tileMean) / tileMean
    if (deviation > worst.deviation) worst = { deviation, block }
  })
  return {
    ...worst,
    blockColumn: worst.block % blocksPerAxis,
    blockRow: Math.floor(worst.block / blocksPerAxis),
  }
}

function wrapAndInnerSteps(luminances, columnOffset, rowOffset) {
  const wrap = { sum: 0, count: 0 }
  const inner = { sum: 0, count: 0 }
  for (let row = 0; row < TILE_SIZE; row += 1) {
    for (let column = 0; column < TILE_SIZE; column += 1) {
      const nextColumn = column + columnOffset
      const nextRow = row + rowOffset
      const wraps = nextColumn >= TILE_SIZE || nextRow >= TILE_SIZE
      const neighbor = (nextRow % TILE_SIZE) * TILE_SIZE + (nextColumn % TILE_SIZE)
      const step = Math.abs(luminances[row * TILE_SIZE + column] - luminances[neighbor])
      const total = wraps ? wrap : inner
      total.sum += step
      total.count += 1
    }
  }
  return { wrap: wrap.sum / wrap.count, inner: inner.sum / inner.count }
}

function firstMipSpreadRatio(luminances) {
  const cellsPerAxis = TILE_SIZE / MIP_CELL_SIZE
  const sums = new Array(cellsPerAxis * cellsPerAxis).fill(0)
  luminances.forEach((value, index) => {
    const column = Math.floor((index % TILE_SIZE) / MIP_CELL_SIZE)
    const row = Math.floor(Math.floor(index / TILE_SIZE) / MIP_CELL_SIZE)
    sums[row * cellsPerAxis + column] += value
  })
  const cells = sums.map((sum) => sum / (MIP_CELL_SIZE * MIP_CELL_SIZE))
  const cellMean = meanOf(cells)
  const variance = meanOf(cells.map((cell) => (cell - cellMean) ** 2))
  return Math.sqrt(variance) / cellMean
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

  it('is not flat, and its spread of luminance stays small', () => {
    const luminances = texelLuminances(generateGrassTile().pixels)
    const mean = luminances.reduce((sum, value) => sum + value, 0) / luminances.length
    const variance =
      luminances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / luminances.length
    const spreadRatio = Math.sqrt(variance) / mean
    expect(spreadRatio).toBeGreaterThanOrEqual(MIN_SPREAD_RATIO)
    expect(spreadRatio).toBeLessThanOrEqual(MAX_SPREAD_RATIO)
  })

  it("has the tile's mean luminance in every aligned 32 by 32 block, within one percent", () => {
    const worst = worstBlockDeviation(texelLuminances(generateGrassTile().pixels))
    expect(
      worst.deviation,
      `worst block (column ${worst.blockColumn}, row ${worst.blockRow}) deviates by ` +
        `${(worst.deviation * PERCENT).toFixed(3)} percent`,
    ).toBeLessThanOrEqual(BLOCK_MEAN_TOLERANCE)
  })

  it.each([
    ['last column to first', 1, 0],
    ['last row to first', 0, 1],
  ])('has a step across the wrap edge from the %s no larger than inside', (_, dx, dy) => {
    const { wrap, inner } = wrapAndInnerSteps(texelLuminances(generateGrassTile().pixels), dx, dy)
    expect(wrap).toBeLessThanOrEqual(inner * MAX_SEAM_STEP_RATIO)
  })

  it('keeps its first mip level from going flat', () => {
    const ratio = firstMipSpreadRatio(texelLuminances(generateGrassTile().pixels))
    expect(ratio).toBeGreaterThanOrEqual(MIN_FIRST_MIP_SPREAD_RATIO)
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
