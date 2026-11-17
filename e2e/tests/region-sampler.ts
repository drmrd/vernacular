import type { Page } from '@playwright/test'
import type { Region } from './frame-pixels'

// Watches one region of the live 3D canvas on every animation frame, from inside the page. A
// screenshot loop sees about ten frames a second, so it can miss a short change; this reads
// the frames the page draws. Each reading is a small color signature of the region, and a
// frame is classified by how near its signature lies to the signature of a known state, such
// as a shut door and an open door. It only reads pixels and never writes app state.

// One reading: the red, green, and blue values of a coarse grid over the region.
export type Signature = readonly number[]

// The coarse grid is this many cells on a side.
const GRID_CELLS = 16
// The bytes of one pixel in the canvas data: red, green, blue, and alpha.
const RGBA_STRIDE = 4

// A frame is "between" two states when it lies at least this far from each of them, in mean
// channel codes. The shut and open door signatures lie about 11 apart, so a part-swung leaf
// clears this margin while the noise of a settled frame (none in practice) does not.
const BETWEEN_MARGIN = 2

interface SamplerState {
  running: boolean
  samples: number[][]
}

// Several samplers can run at once, each under its own name, and they read in the same frames.
interface SamplerWindow {
  journeyRegionSamplers?: Record<string, SamplerState>
}

// The name a sampler takes when the caller needs only one.
const PRIMARY = 'primary'

// The canvas is found again on every frame, so a sampler started before a view switch keeps
// reading across the switch, when the 3D canvas unmounts and a new one mounts.
const CANVAS_SELECTOR = '[aria-label*="3D preview" i] canvas'

interface SamplerInput {
  readonly regions: Record<string, Region>
  readonly cells: number
  readonly selector: string
  readonly stride: number
}

function startInPage({ regions, cells, selector, stride }: SamplerInput): void {
  const probe = document.createElement('canvas')
  probe.width = cells
  probe.height = cells
  const context = probe.getContext('2d', { willReadFrequently: true })
  if (context === null) throw new Error('no 2d context for the region sampler')
  const registry = ((window as unknown as SamplerWindow).journeyRegionSamplers ??= {})
  const states = Object.keys(regions).map((name) => {
    const state: SamplerState = { running: true, samples: [] }
    registry[name] = state
    return { state, region: regions[name] as Region }
  })
  const read = (canvas: HTMLCanvasElement, region: Region): number[] => {
    const scale = canvas.width / canvas.clientWidth
    context.clearRect(0, 0, cells, cells)
    const { x, y, w, h } = region
    context.drawImage(canvas, x * scale, y * scale, w * scale, h * scale, 0, 0, cells, cells)
    const { data } = context.getImageData(0, 0, cells, cells)
    return Array.from(data).filter((_, at) => at % stride !== stride - 1)
  }
  const tick = (): void => {
    if (!states.some(({ state }) => state.running)) return
    const canvas = document.querySelector<HTMLCanvasElement>(selector)
    if (canvas !== null && canvas.clientWidth > 0) {
      for (const { state, region } of states) state.samples.push(read(canvas, region))
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function stopInPage(names: string[]): number[][][] {
  const registry = (window as unknown as SamplerWindow).journeyRegionSamplers ?? {}
  const states = names.map((name) => registry[name])
  for (const state of states) if (state !== undefined) state.running = false
  return states.map((state) => state?.samples ?? [])
}

function afterTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

// Starts reading the region (in canvas pixels) on every frame until stopSampling.
export async function startSampling(
  page: Page,
  region: Region,
  name: string = PRIMARY,
): Promise<void> {
  await startSamplingTogether(page, { [name]: region })
}

// Starts one sampler for each named region. They read in the same frames, so the nth reading of
// one is the nth reading of every other, which lets a journey tell that two things moved together.
export async function startSamplingTogether(
  page: Page,
  regions: Record<string, Region>,
): Promise<void> {
  await page.evaluate(startInPage, {
    regions,
    cells: GRID_CELLS,
    selector: CANVAS_SELECTOR,
    stride: RGBA_STRIDE,
  })
}

// A canvas that has not drawn yet reads as all zeros; those readings say nothing about the
// door, so they are dropped.
function drawn(samples: readonly Signature[]): Signature[] {
  return samples.filter((signature) => signature.some((value) => value !== 0))
}

// Stops reading and returns every reading taken since startSampling, in order.
export async function stopSampling(page: Page, name: string = PRIMARY): Promise<Signature[]> {
  const [readings] = await stopSamplingTogether(page, [name])
  return readings ?? []
}

// Stops the named samplers in the same instant and returns each one's readings, in the order
// of the names.
export async function stopSamplingTogether(page: Page, names: string[]): Promise<Signature[][]> {
  return (await page.evaluate(stopInPage, names)).map(drawn)
}

// One reading of the region as it stands after a couple of drawn frames.
export async function signatureOf(page: Page, region: Region): Promise<Signature> {
  await startSampling(page, region)
  await page.evaluate(afterTwoFrames)
  const readings = await stopSampling(page)
  const latest = readings.at(-1)
  if (latest === undefined) throw new Error('the 3D canvas drew no frame to read')
  return latest
}

// The mean absolute difference between two readings, in channel codes (0..255).
export function signatureDistance(a: Signature, b: Signature): number {
  const total = a.reduce((sum, value, at) => sum + Math.abs(value - (b[at] ?? 0)), 0)
  return total / a.length
}

// For each reading, whether it lies away from both end states, in the order read.
export function betweenFlags(
  readings: readonly Signature[],
  first: Signature,
  second: Signature,
): boolean[] {
  return readings.map(
    (reading) =>
      signatureDistance(reading, first) > BETWEEN_MARGIN &&
      signatureDistance(reading, second) > BETWEEN_MARGIN,
  )
}

// The readings that lie away from both end states: the frames of a leaf that is part way.
export function framesBetween(
  readings: readonly Signature[],
  first: Signature,
  second: Signature,
): Signature[] {
  return readings.filter(
    (reading) =>
      signatureDistance(reading, first) > BETWEEN_MARGIN &&
      signatureDistance(reading, second) > BETWEEN_MARGIN,
  )
}

// The readings that match a state: the frames that show it. A journey that must never show a
// state asserts that this list is empty. Matching uses the same margin as framesBetween, so
// every reading is either between two states or matches one of them.
export function framesShowing(readings: readonly Signature[], state: Signature): Signature[] {
  return readings.filter((reading) => signatureDistance(reading, state) <= BETWEEN_MARGIN)
}
