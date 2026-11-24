import { TARGET_HEX } from './srgb-table.mjs'

const TILE_SIZE = 512
const BYTES_PER_TEXEL = 3
const TEXEL_COUNT = TILE_SIZE * TILE_SIZE
const HEX_RADIX = 16
const HEX_DIGITS_PER_CHANNEL = 2
// TARGET_HEX is `#rrggbb` with the leading `#`, so the channels start at offsets 1, 3, and 5.
const HEX_CHANNEL_OFFSETS = [1, 3, 5]

const TARGET_CHANNELS = HEX_CHANNEL_OFFSETS.map((start) =>
  Number.parseInt(TARGET_HEX.slice(start, start + HEX_DIGITS_PER_CHANNEL), HEX_RADIX),
)

export function generateGrassTile() {
  const pixels = new Uint8Array(TEXEL_COUNT * BYTES_PER_TEXEL)
  for (let texel = 0; texel < TEXEL_COUNT; texel += 1) {
    pixels.set(TARGET_CHANNELS, texel * BYTES_PER_TEXEL)
  }
  return { width: TILE_SIZE, height: TILE_SIZE, pixels }
}
