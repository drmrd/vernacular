import { inflateSync } from 'node:zlib'

// Pixel comparison of two canvas screenshots taken in the same run, for the live 3D pane
// specs. The live pane renders through the non-deterministic WebGPU backend (ADR-0045), so a
// committed baseline would not hold; these helpers compare frames against each other instead.
// The decoder reads the 8-bit, non-interlaced PNG that the browser writes for a screenshot and
// needs no dependency.

// A rectangle in frame pixels: its top-left corner and its size.
export interface Region {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

// How far apart two frames are inside a region: the mean absolute channel difference
// (0..255), and the fraction of pixels where some channel differs by more than PIXEL_DELTA.
export interface FrameDifference {
  readonly mean: number
  readonly changedFraction: number
}

interface Pixels {
  readonly width: number
  readonly height: number
  readonly channels: number
  readonly data: Uint8Array
}

interface Point {
  readonly x: number
  readonly y: number
}

// The bytes a scanline filter predicts from: the byte to the left, above, and above and left.
interface Neighbours {
  readonly left: number
  readonly up: number
  readonly upLeft: number
}

const PNG_SIGNATURE_BYTES = 8
const CHUNK_LENGTH_BYTES = 4
const CHUNK_TYPE_BYTES = 4
const CHUNK_HEADER_BYTES = CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES
const CHUNK_CRC_BYTES = 4
const COLOR_TYPE_RGB = 2
const COLOR_TYPE_RGBA = 6
const RGB_CHANNELS = 3
const RGBA_CHANNELS = 4
const CHANNELS_BY_COLOR_TYPE = new Map([
  [COLOR_TYPE_RGB, RGB_CHANNELS],
  [COLOR_TYPE_RGBA, RGBA_CHANNELS],
])
const HEADER_WIDTH_OFFSET = 0
const HEADER_HEIGHT_OFFSET = 4
const HEADER_COLOR_TYPE_OFFSET = 9
const BYTE_VALUES = 256

// A channel difference beyond this many codes marks a pixel as changed.
const PIXEL_DELTA = 24
// A pixel that differs this much in some channel belongs to the box of a changed object.
const BOX_DELTA = 40

const FILTER_SUB = 1
const FILTER_UP = 2
const FILTER_AVERAGE = 3
const FILTER_PAETH = 4

function paeth({ left, up, upLeft }: Neighbours): number {
  const estimate = left + up - upLeft
  const toLeft = Math.abs(estimate - left)
  const toUp = Math.abs(estimate - up)
  const toUpLeft = Math.abs(estimate - upLeft)
  if (toLeft <= toUp && toLeft <= toUpLeft) return left
  return toUp <= toUpLeft ? up : upLeft
}

// Predicts a byte from its already decoded neighbours, as the scanline's filter type defines.
function predictor(filter: number, neighbours: Neighbours): number {
  if (filter === FILTER_SUB) return neighbours.left
  if (filter === FILTER_UP) return neighbours.up
  if (filter === FILTER_AVERAGE) return Math.floor((neighbours.left + neighbours.up) / 2)
  return filter === FILTER_PAETH ? paeth(neighbours) : 0
}

interface Layout {
  readonly width: number
  readonly height: number
  readonly channels: number
}

// The bytes of the image being decoded: the filtered scanlines, the decoded output so far, and
// the image's layout.
interface Scan {
  readonly raw: Uint8Array
  readonly out: Uint8Array
  readonly layout: Layout
}

// The decoded neighbours of the byte at a column and row. A byte outside the image reads as 0.
function neighboursAt(scan: Scan, at: Point): Neighbours {
  const { out, layout } = scan
  const stride = layout.width * layout.channels
  const index = at.y * stride + at.x
  const hasLeft = at.x >= layout.channels
  const hasUp = at.y > 0
  const read = (back: number, present: boolean): number => (present ? (out[index - back] ?? 0) : 0)
  return {
    left: read(layout.channels, hasLeft),
    up: read(stride, hasUp),
    upLeft: read(stride + layout.channels, hasLeft && hasUp),
  }
}

// Reverses the filter of one scanline into the output, which already holds the rows above it.
function unfilterRow(scan: Scan, row: number): void {
  const stride = scan.layout.width * scan.layout.channels
  const rawStart = row * (stride + 1)
  const filter = scan.raw[rawStart] ?? 0
  for (let column = 0; column < stride; column++) {
    const filtered = scan.raw[rawStart + 1 + column] ?? 0
    const predicted = predictor(filter, neighboursAt(scan, { x: column, y: row }))
    scan.out[row * stride + column] = (filtered + predicted) % BYTE_VALUES
  }
}

function unfilter(raw: Uint8Array, layout: Layout): Uint8Array {
  const out = new Uint8Array(layout.width * layout.channels * layout.height)
  for (let row = 0; row < layout.height; row++) unfilterRow({ raw, out, layout }, row)
  return out
}

// Collects the header and the image data chunks of a PNG.
function readChunks(png: Buffer): { header: Buffer | undefined; image: Buffer[] } {
  const image: Buffer[] = []
  let header: Buffer | undefined
  let offset = PNG_SIGNATURE_BYTES
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('latin1', offset + CHUNK_LENGTH_BYTES, offset + CHUNK_HEADER_BYTES)
    const bodyStart = offset + CHUNK_HEADER_BYTES
    const body = png.subarray(bodyStart, bodyStart + length)
    if (type === 'IHDR') header = body
    if (type === 'IDAT') image.push(body)
    offset = bodyStart + length + CHUNK_CRC_BYTES
  }
  return { header, image }
}

function decodePng(png: Buffer): Pixels {
  const { header, image } = readChunks(png)
  if (header === undefined) throw new Error('the screenshot has no PNG header')
  const width = header.readUInt32BE(HEADER_WIDTH_OFFSET)
  const height = header.readUInt32BE(HEADER_HEIGHT_OFFSET)
  const channels = CHANNELS_BY_COLOR_TYPE.get(header.readUInt8(HEADER_COLOR_TYPE_OFFSET))
  if (channels === undefined) throw new Error('the screenshot is not an RGB or RGBA PNG')
  const data = unfilter(inflateSync(Buffer.concat(image)), { width, height, channels })
  return { width, height, channels, data }
}

// The absolute differences of the red, green, and blue channels at one pixel of two frames.
function channelDeltas(a: Pixels, b: Pixels, at: Point): number[] {
  const startA = (at.y * a.width + at.x) * a.channels
  const startB = (at.y * b.width + at.x) * b.channels
  return [0, 1, 2].map((channel) =>
    Math.abs((a.data[startA + channel] ?? 0) - (b.data[startB + channel] ?? 0)),
  )
}

function checkSameSize(a: Pixels, b: Pixels): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`the frames differ in size: ${a.width}x${a.height} and ${b.width}x${b.height}`)
  }
}

function decodePair(frameA: Buffer, frameB: Buffer): [Pixels, Pixels] {
  const a = decodePng(frameA)
  const b = decodePng(frameB)
  checkSameSize(a, b)
  return [a, b]
}

// Compares the same region of two frames of the same size.
export function frameDifference(frameA: Buffer, frameB: Buffer, region: Region): FrameDifference {
  const [a, b] = decodePair(frameA, frameB)
  let sum = 0
  let changed = 0
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      const deltas = channelDeltas(a, b, { x, y })
      sum += deltas.reduce((total, delta) => total + delta, 0)
      if (Math.max(...deltas) > PIXEL_DELTA) changed++
    }
  }
  const pixels = region.w * region.h
  return { mean: sum / (pixels * RGB_CHANNELS), changedFraction: changed / pixels }
}

// The whole frame as a region.
export function wholeFrame(frame: Buffer): Region {
  const { width, height } = decodePng(frame)
  return { x: 0, y: 0, w: width, h: height }
}

// The box that holds every pixel where two frames differ strongly, or null when none does.
// The box is how a journey finds an object by what changes when it moves.
export function changedBox(frameA: Buffer, frameB: Buffer): Region | null {
  const [a, b] = decodePair(frameA, frameB)
  let left = a.width
  let top = a.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (Math.max(...channelDeltas(a, b, { x, y })) <= BOX_DELTA) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
}

// Grows a region by a margin on every side, kept inside a frame of the given size.
export function padRegion(region: Region, margin: number, bounds: Region): Region {
  const x = Math.max(bounds.x, region.x - margin)
  const y = Math.max(bounds.y, region.y - margin)
  const right = Math.min(bounds.x + bounds.w, region.x + region.w + margin)
  const bottom = Math.min(bounds.y + bounds.h, region.y + region.h + margin)
  return { x, y, w: right - x, h: bottom - y }
}
