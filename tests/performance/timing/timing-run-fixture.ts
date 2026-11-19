import { REFERENCE_EDITS } from '../reference-project'
import type { FrameTiming, TimingRun, TimingSummary } from './timing-record'

/** The names of the four render variants, as the report row labels spell them. */
export const RENDER_VARIANT_NAMES = [
  'floor, schematic',
  'floor, realistic',
  'building, schematic',
  'building, realistic',
] as const

/** The names of the reference project's edits, as the report row labels spell them. */
export const REFERENCE_EDIT_NAMES: readonly string[] = REFERENCE_EDITS.map((edit) => edit.name)

const SAMPLES = 100
const MAIN_THREAD_SPREAD_MS = 1.5
const GPU_SPREAD_MS = 2.25

/** A summary of 100 samples with the given median and 95th percentile, in milliseconds. */
export function summary(medianMs: number, p95Ms: number): TimingSummary {
  return { samples: SAMPLES, medianMs, p95Ms }
}

/** The two timings of one frame: until the main thread is done, and until the GPU is done. */
export function frame(mainThreadMs: number, untilGpuDoneMs: number): FrameTiming {
  return {
    mainThread: summary(mainThreadMs, mainThreadMs + MAIN_THREAD_SPREAD_MS),
    untilGpuDone: summary(untilGpuDoneMs, untilGpuDoneMs + GPU_SPREAD_MS),
  }
}

function eachName<Value>(names: readonly string[], value: () => Value): Record<string, Value> {
  return Object.fromEntries(names.map((name) => [name, value()]))
}

const MACHINE: TimingRun['machine'] = {
  processor: 'Apple M5 Pro',
  logicalCores: 18,
  memoryGiB: 48,
  operatingSystem: 'macOS 26.1',
  browser: 'Chromium 142.0.7444.0',
  webGpuAdapter: 'apple / metal-3 / Apple M5 Pro',
  webGlRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)',
  renderer: 'webgpu',
}

function conditions(): TimingRun['conditions'] {
  return {
    visibleThroughout: true,
    focused: true,
    power: 'mains',
    devicePixelRatio: 2,
    displayFrameMs: 8.33,
    planCanvasPx: { width: 800, height: 600 },
    sceneCanvasCssPx: { width: 960, height: 600 },
    sceneDrawingBufferPx: { width: 1920, height: 1200 },
  }
}

const METHOD: TimingRun['method'] = {
  planRedraw: { warmup: 20, timed: 200 },
  sceneUpdate: { warmup: 20, timed: 100 },
  renderFrame: { warmup: 30, timed: 100 },
  renderAfterEdit: { warmup: 30, timed: 100 },
}

const PLAN_MEDIAN_MS = 3.21
const PLAN_P95_MS = 5.4
const UPDATE_MEDIAN_MS = 2.5
const UPDATE_P95_MS = 4.75
const FRAME_MAIN_THREAD_MS = 1.2
const FRAME_UNTIL_GPU_MS = 4.1
const AFTER_EDIT_MAIN_THREAD_MS = 1.9
const AFTER_EDIT_UNTIL_GPU_MS = 5.3

function times(): TimingRun['times'] {
  return {
    planRedraw: summary(PLAN_MEDIAN_MS, PLAN_P95_MS),
    sceneUpdate: eachName(REFERENCE_EDIT_NAMES, () => summary(UPDATE_MEDIAN_MS, UPDATE_P95_MS)),
    renderFrame: eachName(RENDER_VARIANT_NAMES, () =>
      frame(FRAME_MAIN_THREAD_MS, FRAME_UNTIL_GPU_MS),
    ),
    renderAfterEdit: eachName(REFERENCE_EDIT_NAMES, () =>
      frame(AFTER_EDIT_MAIN_THREAD_MS, AFTER_EDIT_UNTIL_GPU_MS),
    ),
  }
}

/**
 * A finished, clean run: every time of the report is present (the plan redraw, one update and one
 * frame after the edit for each reference edit, two timings for each of the four render
 * variants). Each call returns a new object, so a test may change it freely.
 */
export function aTimingRun(): TimingRun {
  return {
    format: 1,
    quick: false,
    commit: '4e51b3c9',
    uncommittedChanges: false,
    takenAt: '2026-11-21T10:02:11-05:00',
    build: { mode: 'production', timerResolutionMs: 0.005 },
    machine: { ...MACHINE },
    conditions: conditions(),
    method: structuredClone(METHOD),
    times: times(),
  }
}
