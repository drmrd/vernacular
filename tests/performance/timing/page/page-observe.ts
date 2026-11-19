import type { PageDescription } from '../run-timing'
import type { TimingRun } from '../timing-record'
import { summarizeSamples } from '../timing-statistics'
import type { PageInstruments } from './page-instruments'
import { SCENE_CANVAS_CSS_PX, expectedDrawingBufferPx, planCanvas } from './page-layout'
import { frameWithinLimit } from './page-waits'

/** The frames whose intervals give the display frame interval: 30 intervals, half a second at 60 Hz. */
const DISPLAY_FRAME_COUNT = 31
/** The clock reads that find the timer's step: the smallest nonzero difference of two reads. */
const TIMER_STEP_ATTEMPTS = 200
/** The timer resolution is kept in microseconds, three decimals of a millisecond. */
const MICROSECONDS_PER_MILLISECOND = 1000
const MILLISECONDS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60
/** The length of "yyyy-mm-ddThh:mm:ss" in an ISO 8601 string. */
const LOCAL_DATE_TIME_LENGTH = 19

/** The median interval between display frames, or null when the frames stopped. */
async function displayFrameMs(hostFrame: () => Promise<number>): Promise<number | null> {
  const times: number[] = []
  try {
    while (times.length < DISPLAY_FRAME_COUNT) {
      times.push(await frameWithinLimit(hostFrame, 'the display frame check'))
    }
  } catch {
    return null
  }
  const intervals = times.slice(1).map((time, index) => time - (times[index] ?? time))
  return summarizeSamples(intervals).medianMs
}

/** The smallest step of `performance.now()`, in milliseconds. */
function timerResolutionMs(): number {
  let smallest = Number.POSITIVE_INFINITY
  for (let attempt = 0; attempt < TIMER_STEP_ATTEMPTS; attempt += 1) {
    const first = performance.now()
    let next = performance.now()
    while (next === first) next = performance.now()
    smallest = Math.min(smallest, next - first)
  }
  return Math.round(smallest * MICROSECONDS_PER_MILLISECOND) / MICROSECONDS_PER_MILLISECOND
}

function twoDigits(value: number): string {
  return String(Math.trunc(Math.abs(value))).padStart(2, '0')
}

/** The local time as ISO 8601 with its offset, such as 2026-11-21T10:02:11-05:00. */
function localTimeWithOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const shifted = new Date(date.getTime() + offsetMinutes * MILLISECONDS_PER_MINUTE)
  const sign = offsetMinutes < 0 ? '-' : '+'
  const hours = twoDigits(offsetMinutes / MINUTES_PER_HOUR)
  const minutes = twoDigits(offsetMinutes % MINUTES_PER_HOUR)
  return `${shifted.toISOString().slice(0, LOCAL_DATE_TIME_LENGTH)}${sign}${hours}:${minutes}`
}

function adapterName(info: GPUAdapterInfo): string {
  const device = info.device === '' ? info.description : info.device
  return [info.vendor, info.architecture, device]
    .map((part) => (part === '' ? 'unknown' : part))
    .join(' / ')
}

async function webGpuAdapter(): Promise<PageDescription['webGpuAdapter']> {
  if (!('gpu' in navigator)) return null
  const adapter = await navigator.gpu.requestAdapter()
  if (adapter === null) return null
  return { name: adapterName(adapter.info), isFallback: adapter.info.isFallbackAdapter }
}

/** The unmasked renderer string of a WebGL 2 context on a canvas that is never attached. */
function webGlRenderer(): string {
  const gl = document.createElement('canvas').getContext('webgl2')
  if (gl === null) return 'no WebGL 2 context'
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer: unknown = gl.getParameter(
    debugInfo === null ? gl.RENDERER : debugInfo.UNMASKED_RENDERER_WEBGL,
  )
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return String(renderer)
}

interface BatteryReading {
  charging: boolean
}

async function powerSource(): Promise<TimingRun['conditions']['power']> {
  const { getBattery } = navigator as { getBattery?: () => Promise<BatteryReading> }
  if (getBattery === undefined) return 'unknown'
  try {
    const battery = await getBattery.call(navigator)
    return battery.charging ? 'mains' : 'battery'
  } catch {
    return 'unknown'
  }
}

/** What the page sees of itself and of its run conditions; the run calls this first and last. */
export async function observePage(instruments: PageInstruments): Promise<PageDescription> {
  const plan = planCanvas()
  return {
    productionBuild: import.meta.env.PROD,
    webGpuAdapter: await webGpuAdapter(),
    visible: document.visibilityState === 'visible',
    displayFrameMs: await displayFrameMs(instruments.hostFrame),
    everHidden: instruments.everHidden(),
    takenAt: localTimeWithOffset(new Date()),
    timerResolutionMs: timerResolutionMs(),
    webGlRenderer: webGlRenderer(),
    focused: document.hasFocus(),
    power: await powerSource(),
    devicePixelRatio: window.devicePixelRatio,
    planCanvasPx: { width: plan.width, height: plan.height },
    sceneCanvasCssPx: SCENE_CANVAS_CSS_PX,
    sceneDrawingBufferPx: expectedDrawingBufferPx(),
  }
}
