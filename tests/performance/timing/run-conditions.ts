import type { TimingRun } from './timing-record'

/**
 * The longest median interval between display frames that a run accepts. Browsers throttle frames
 * to 30 a second or less when a window is occluded, on a power saver, or on a busy machine; one
 * frame at 30 a second lasts 33.3 ms, so 34 ms is the first interval that shows the throttle. Times
 * taken under it describe the throttle and not the code.
 */
const MAXIMUM_DISPLAY_FRAME_MS = 34

/** The names of the software rasterizers that a browser may fall back to when no GPU is in use. */
const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|software|basic render driver/i

/** What the page observed about the run before it measured anything. */
export interface ObservedConditions {
  productionBuild: boolean
  webGpuAdapter: { name: string; isFallback: boolean } | null
  visible: boolean
  /** The median interval between frames before any phase, or null when no frame arrived. */
  displayFrameMs: number | null
}

/**
 * True for a renderer or adapter name of a software rasterizer (SwiftShader, llvmpipe, Software,
 * Basic Render Driver), in any letter case.
 */
export function isSoftwareRenderer(name: string): boolean {
  return SOFTWARE_RENDERER_PATTERN.test(name)
}

function adapterRefusal(adapter: ObservedConditions['webGpuAdapter']): string | undefined {
  if (adapter === null) {
    return (
      'The browser offered no WebGPU adapter, so nothing was measured. ' +
      'Run on a machine with a hardware GPU and a browser that supports WebGPU.'
    )
  }
  if (adapter.isFallback || isSoftwareRenderer(adapter.name)) {
    return (
      `The WebGPU adapter is a software renderer ("${adapter.name}"), so nothing was measured. ` +
      'Run on a machine whose browser uses the hardware GPU.'
    )
  }
  return undefined
}

function displayFrameRefusal(displayFrameMs: number | null): string | undefined {
  if (displayFrameMs === null) {
    return (
      'No display frame arrived, so nothing was measured. ' +
      'Keep the browser window visible and in front, not minimized, for the whole run.'
    )
  }
  if (displayFrameMs > MAXIMUM_DISPLAY_FRAME_MS) {
    return (
      `The display frames came ${displayFrameMs} ms apart, slower than ${MAXIMUM_DISPLAY_FRAME_MS} ms, ` +
      'so the browser is throttling frames and nothing was measured. ' +
      'Keep the window in front, turn off power saving, and close other heavy applications.'
    )
  }
  return undefined
}

/** The reasons this run cannot measure, empty when it can. Each reason says what to change. */
export function runRefusals(observed: ObservedConditions): string[] {
  const reasons = [
    observed.productionBuild
      ? undefined
      : 'The page is a development build, so nothing was measured. ' +
        'Run the timing command, which serves the production build.',
    adapterRefusal(observed.webGpuAdapter),
    observed.visible
      ? undefined
      : 'The window was hidden, so nothing was measured. ' +
        'Keep the browser window visible and in front for the whole run.',
    displayFrameRefusal(observed.displayFrameMs),
  ]
  return reasons.filter((reason): reason is string => reason !== undefined)
}

/**
 * The reasons a finished run may not become the baseline, empty when it may. A power source of
 * 'unknown' is accepted, because the page cannot always read it and the run on the owner's machine
 * must not be blocked by that; the report warns about it instead.
 */
export function baselineWriteRefusals(run: TimingRun): string[] {
  const reasons = [
    run.quick
      ? 'This was a quick run, which takes too few samples for a baseline. ' +
        'Run again without --quick to write a baseline.'
      : undefined,
    run.conditions.power === 'battery'
      ? 'The machine ran on battery power, which lowers clock speeds. ' +
        'Plug in the charger and run again to write a baseline.'
      : undefined,
    run.uncommittedChanges
      ? 'The working tree had uncommitted changes, so the times do not belong to a commit. ' +
        'Commit or discard the changes and run again to write a baseline.'
      : undefined,
    run.conditions.visibleThroughout
      ? undefined
      : 'The window was not visible throughout the run. ' +
        'Keep the browser window visible and in front, and run again to write a baseline.',
    isSoftwareRenderer(run.machine.webGpuAdapter)
      ? `The WebGPU adapter is a software renderer ("${run.machine.webGpuAdapter}"). ` +
        'Write a baseline only from a machine whose browser uses the hardware GPU.'
      : undefined,
  ]
  return reasons.filter((reason): reason is string => reason !== undefined)
}
