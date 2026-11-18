import type { Page } from '@playwright/test'

// Pixel comparison of two canvas screenshots taken in the same run, for the live 3D pane
// specs. The live pane renders through the non-deterministic WebGPU backend (ADR-0045), so a
// committed baseline would not hold; these helpers compare frames against each other instead.
// Like sampleCanvasColor in scene-helpers.ts, they hand each PNG back to the page as a data URL
// and read pixels from the browser's native decode, so no image-decoding code or dependency is
// needed here. The page returns the decoded bytes, and the comparison runs in the test process.

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
  readonly data: Buffer
}

// A channel difference beyond this many codes marks a pixel as changed.
const PIXEL_DELTA = 24
// A pixel that differs this much in some channel belongs to the box of a changed object.
const BOX_DELTA = 40
// ImageData holds four bytes for each pixel, and the first three are the colour channels.
const RGBA_STRIDE = 4
const COLOR_CHANNELS = 3
// Bytes turned into text at a time when the page hands its pixels back.
const ENCODE_CHUNK = 0x8000

// Serialized into the page, so it stands alone: decodes a PNG data URL with the browser and
// returns its RGBA bytes as base64 text.
async function decodeInPage(input: { url: string; chunk: number }): Promise<{
  width: number
  height: number
  base64: string
}> {
  const image = new Image()
  image.src = input.url
  await image.decode()
  const surface = document.createElement('canvas')
  surface.width = image.width
  surface.height = image.height
  const context = surface.getContext('2d')
  if (context === null) throw new Error('no 2d context for the frame surface')
  context.drawImage(image, 0, 0)
  const { data, width, height } = context.getImageData(0, 0, image.width, image.height)
  let binary = ''
  for (let at = 0; at < data.length; at += input.chunk) {
    binary += String.fromCharCode(...data.subarray(at, at + input.chunk))
  }
  return { width, height, base64: btoa(binary) }
}

// The channel differences of one pixel of two frames: the sum, and the largest.
function pixelDelta(a: Pixels, b: Pixels, at: number): { sum: number; largest: number } {
  let sum = 0
  let largest = 0
  for (let channel = 0; channel < COLOR_CHANNELS; channel++) {
    const delta = Math.abs((a.data[at + channel] ?? 0) - (b.data[at + channel] ?? 0))
    sum += delta
    largest = Math.max(largest, delta)
  }
  return { sum, largest }
}

function requireSameSize(a: Pixels, b: Pixels): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`the frames differ in size: ${a.width}x${a.height} and ${b.width}x${b.height}`)
  }
}

function compareRegion(a: Pixels, b: Pixels, region: Region): FrameDifference {
  requireSameSize(a, b)
  let sum = 0
  let changed = 0
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      const delta = pixelDelta(a, b, (y * a.width + x) * RGBA_STRIDE)
      sum += delta.sum
      if (delta.largest > PIXEL_DELTA) changed++
    }
  }
  const pixels = region.w * region.h
  return { mean: sum / (pixels * COLOR_CHANNELS), changedFraction: changed / pixels }
}

function boxOfChange(a: Pixels, b: Pixels, within?: Region): Region | null {
  requireSameSize(a, b)
  const area = within ?? { x: 0, y: 0, w: a.width, h: a.height }
  let left = a.width
  let top = a.height
  let right = -1
  let bottom = -1
  for (let y = area.y; y < area.y + area.h; y++) {
    for (let x = area.x; x < area.x + area.w; x++) {
      if (pixelDelta(a, b, (y * a.width + x) * RGBA_STRIDE).largest <= BOX_DELTA) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
}

// Reads frames through the browser of one page.
export interface FrameReader {
  // Compares the same region of two frames of the same size.
  difference(a: Buffer, b: Buffer, region: Region): Promise<FrameDifference>
  // The box that holds every pixel where two frames differ strongly, or null when none does.
  // The box is how a journey finds an object by what changes when it moves. Only the pixels
  // inside the optional region count, which keeps text drawn over the canvas out of the box.
  changedBox(a: Buffer, b: Buffer, within?: Region): Promise<Region | null>
  // The whole frame as a region.
  whole(frame: Buffer): Promise<Region>
}

export function frameReader(page: Page): FrameReader {
  // Each screenshot is decoded once, however many comparisons use it.
  const decoded = new WeakMap<Buffer, Promise<Pixels>>()
  const pixelsOf = (frame: Buffer): Promise<Pixels> => {
    const known = decoded.get(frame)
    if (known !== undefined) return known
    const url = `data:image/png;base64,${frame.toString('base64')}`
    const fresh = page
      .evaluate(decodeInPage, { url, chunk: ENCODE_CHUNK })
      .then(({ width, height, base64 }) => ({ width, height, data: Buffer.from(base64, 'base64') }))
    decoded.set(frame, fresh)
    return fresh
  }
  return {
    difference: async (a, b, region) => compareRegion(await pixelsOf(a), await pixelsOf(b), region),
    changedBox: async (a, b, within) => boxOfChange(await pixelsOf(a), await pixelsOf(b), within),
    whole: async (frame) => {
      const { width, height } = await pixelsOf(frame)
      return { x: 0, y: 0, w: width, h: height }
    },
  }
}

// Grows a region by a margin on every side, kept inside a frame of the given size.
export function padRegion(region: Region, margin: number, bounds: Region): Region {
  const x = Math.max(bounds.x, region.x - margin)
  const y = Math.max(bounds.y, region.y - margin)
  const right = Math.min(bounds.x + bounds.w, region.x + region.w + margin)
  const bottom = Math.min(bounds.y + bounds.h, region.y + region.h + margin)
  return { x, y, w: right - x, h: bottom - y }
}
