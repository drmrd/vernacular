import { TARGET_HEX } from './srgb-table.mjs'

const TILE_SIZE = 512
const CHANNEL_COUNT = 3
const HEX_RADIX = 16

function targetChannels() {
  return [1, 3, 5].map((start) => Number.parseInt(TARGET_HEX.slice(start, start + 2), HEX_RADIX))
}

export function generateGrassTile() {
  const channels = targetChannels()
  const pixels = new Uint8Array(TILE_SIZE * TILE_SIZE * CHANNEL_COUNT)
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = channels[index % CHANNEL_COUNT]
  }
  return { width: TILE_SIZE, height: TILE_SIZE, pixels }
}
