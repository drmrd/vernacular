import { LINEAR_TABLE, TARGET_HEX } from './srgb-table.mjs'

const TILE_SIZE = 512
const BYTES_PER_TEXEL = 3
const HEX_RADIX = 16
const HEX_DIGITS_PER_CHANNEL = 2
// TARGET_HEX is `#rrggbb` with the leading `#`, so the channels start at offsets 1, 3, and 5.
const HEX_CHANNEL_OFFSETS = [1, 3, 5]

// Each texel's linear value is scaled by (NOISE_DENOMINATOR + noise) / NOISE_DENOMINATOR, with noise
// uniform in [-NOISE_AMPLITUDE, NOISE_AMPLITUDE]. That is a spread of about 10 percent of the mean.
// Each block's mean noise is then subtracted, which shifts the values by a few units per block.
const NOISE_DENOMINATOR = 1024
const NOISE_AMPLITUDE = 177
const NOISE_VALUE_COUNT = 2 * NOISE_AMPLITUDE + 1

// Each aligned block's mean noise is subtracted from its texels, so every block averages to the
// tile's mean while neighboring texels keep independent noise.
const BLOCK_SIZE = 32
const BLOCKS_PER_SIDE = TILE_SIZE / BLOCK_SIZE
const TEXELS_PER_BLOCK = BLOCK_SIZE * BLOCK_SIZE

const HASH_SEED = 0x9e3779b9
const HASH_COLUMN_MULTIPLIER = 0x85ebca6b
const HASH_MIX_MULTIPLIER = 0xc2b2ae35
const HASH_SHIFT_HIGH = 16
const HASH_SHIFT_MID = 13

const TARGET_CODES = HEX_CHANNEL_OFFSETS.map((start) =>
  Number.parseInt(TARGET_HEX.slice(start, start + HEX_DIGITS_PER_CHANNEL), HEX_RADIX),
)
const TARGET_LINEAR = TARGET_CODES.map((code) => LINEAR_TABLE[code])

function hashTexel(column, row) {
  let hash = HASH_SEED ^ Math.imul(column, HASH_COLUMN_MULTIPLIER)
  hash = Math.imul(hash ^ (hash >>> HASH_SHIFT_HIGH), HASH_MIX_MULTIPLIER) ^ row
  hash = Math.imul(hash ^ (hash >>> HASH_SHIFT_MID), HASH_MIX_MULTIPLIER)
  return (hash ^ (hash >>> HASH_SHIFT_HIGH)) >>> 0
}

// Each texel takes independent uniform noise from an integer hash of its position.
function noiseAt(column, row) {
  return (hashTexel(column, row) % NOISE_VALUE_COUNT) - NOISE_AMPLITUDE
}

function blockMeanNoise(blockColumn, blockRow) {
  let sum = 0
  const top = blockRow * BLOCK_SIZE
  const left = blockColumn * BLOCK_SIZE
  const bottom = top + BLOCK_SIZE
  const right = left + BLOCK_SIZE
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      sum += noiseAt(column, row)
    }
  }
  return Math.round(sum / TEXELS_PER_BLOCK)
}

function blockMeanNoises() {
  const means = new Int32Array(BLOCKS_PER_SIDE * BLOCKS_PER_SIDE)
  for (let blockRow = 0; blockRow < BLOCKS_PER_SIDE; blockRow += 1) {
    for (let blockColumn = 0; blockColumn < BLOCKS_PER_SIDE; blockColumn += 1) {
      means[blockRow * BLOCKS_PER_SIDE + blockColumn] = blockMeanNoise(blockColumn, blockRow)
    }
  }
  return means
}

function balancedNoiseAt(column, row, means) {
  const blockIndex =
    Math.floor(row / BLOCK_SIZE) * BLOCKS_PER_SIDE + Math.floor(column / BLOCK_SIZE)
  return noiseAt(column, row) - means[blockIndex]
}

function nearestCode(linearValue) {
  let low = 0
  let high = LINEAR_TABLE.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (LINEAR_TABLE[middle] < linearValue) low = middle + 1
    else high = middle
  }
  const previous = Math.max(low - 1, 0)
  return linearValue - LINEAR_TABLE[previous] <= LINEAR_TABLE[low] - linearValue ? previous : low
}

export function generateGrassTile() {
  const pixels = new Uint8Array(TILE_SIZE * TILE_SIZE * BYTES_PER_TEXEL)
  const means = blockMeanNoises()
  for (let row = 0; row < TILE_SIZE; row += 1) {
    for (let column = 0; column < TILE_SIZE; column += 1) {
      const scale = NOISE_DENOMINATOR + balancedNoiseAt(column, row, means)
      const offset = (row * TILE_SIZE + column) * BYTES_PER_TEXEL
      for (let channel = 0; channel < BYTES_PER_TEXEL; channel += 1) {
        const scaled = Math.round((TARGET_LINEAR[channel] * scale) / NOISE_DENOMINATOR)
        pixels[offset + channel] = nearestCode(scaled)
      }
    }
  }
  return { width: TILE_SIZE, height: TILE_SIZE, pixels }
}
