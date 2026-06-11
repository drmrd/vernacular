import type { Srgb } from './oklab'

const MAX_CHANNEL = 255
// Hexadecimal is base 16; naming the radix keeps no-magic-numbers satisfied.
const HEX_RADIX = 16
const HEX_PAIR_LENGTH = 2
const SHORTHAND_LENGTH = 3

function channelToHex(channel: number): string {
  return Math.round(channel * MAX_CHANNEL)
    .toString(HEX_RADIX)
    .padStart(HEX_PAIR_LENGTH, '0')
}

export function formatHex(srgb: Srgb): string {
  return `#${channelToHex(srgb.r)}${channelToHex(srgb.g)}${channelToHex(srgb.b)}`
}

function channelFromHexPair(pair: string): number {
  return parseInt(pair, HEX_RADIX) / MAX_CHANNEL
}

export function parseHex(hex: string): Srgb {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (match === null) {
    throw new Error(`Not a valid hex color: "${hex}"`)
  }
  const digits = match[1]!
  const full = digits.length === SHORTHAND_LENGTH ? digits.replace(/(.)/g, '$1$1') : digits
  const pairs = full.match(/.{2}/g)!
  return {
    r: channelFromHexPair(pairs[0]!),
    g: channelFromHexPair(pairs[1]!),
    b: channelFromHexPair(pairs[2]!),
  }
}
