import { LINEAR_TABLE, TARGET_HEX } from './srgb-table.mjs'

const TILE_SIZE = 512
const BYTES_PER_TEXEL = 3
const HEX_RADIX = 16
const HEX_DIGITS_PER_CHANNEL = 2
// TARGET_HEX is `#rrggbb` with the leading `#`, so the channels start at offsets 1, 3, and 5.
const HEX_CHANNEL_OFFSETS = [1, 3, 5]

// Each texel's linear value is scaled by (NOISE_DENOMINATOR + noise) / NOISE_DENOMINATOR, with noise
// uniform in [-NOISE_AMPLITUDE, NOISE_AMPLITUDE]. That is a spread of about 10 percent of the mean.
const NOISE_DENOMINATOR = 1024
const NOISE_AMPLITUDE = 177
const NOISE_VALUE_COUNT = 2 * NOISE_AMPLITUDE + 1

const HASH_SEED = 0x9e3779b9
const HASH_COLUMN_MULTIPLIER = 0x85ebca6b
const HASH_ROW_MULTIPLIER = 0xc2b2ae35
const HASH_SHIFT_HIGH = 16
const HASH_SHIFT_MID = 13

const TARGET_CODES = HEX_CHANNEL_OFFSETS.map((start) =>
  Number.parseInt(TARGET_HEX.slice(start, start + HEX_DIGITS_PER_CHANNEL), HEX_RADIX),
)
const TARGET_LINEAR = TARGET_CODES.map((code) => LINEAR_TABLE[code])

function hashTexelPair(pairColumn, row) {
  let hash = HASH_SEED ^ Math.imul(pairColumn, HASH_COLUMN_MULTIPLIER)
  hash = Math.imul(hash ^ (hash >>> HASH_SHIFT_HIGH), HASH_ROW_MULTIPLIER) ^ row
  hash = Math.imul(hash ^ (hash >>> HASH_SHIFT_MID), HASH_ROW_MULTIPLIER)
  return (hash ^ (hash >>> HASH_SHIFT_HIGH)) >>> 0
}

// Horizontally adjacent texels share one hash and take opposite noise, so every aligned pair of
// columns, and therefore every block of even width, has noise that sums to zero.
function noiseAt(column, row) {
  const magnitude = (hashTexelPair(column >> 1, row) % NOISE_VALUE_COUNT) - NOISE_AMPLITUDE
  return column & 1 ? -magnitude : magnitude
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
  for (let row = 0; row < TILE_SIZE; row += 1) {
    for (let column = 0; column < TILE_SIZE; column += 1) {
      const scale = NOISE_DENOMINATOR + noiseAt(column, row)
      const offset = (row * TILE_SIZE + column) * BYTES_PER_TEXEL
      for (let channel = 0; channel < BYTES_PER_TEXEL; channel += 1) {
        const scaled = Math.round((TARGET_LINEAR[channel] * scale) / NOISE_DENOMINATOR)
        pixels[offset + channel] = nearestCode(scaled)
      }
    }
  }
  return { width: TILE_SIZE, height: TILE_SIZE, pixels }
}
