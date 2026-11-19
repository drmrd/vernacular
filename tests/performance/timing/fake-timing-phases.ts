import { REFERENCE_EDITS } from '../reference-project'
import type { FrameSample } from './frame-probe'
import { RENDER_VARIANTS } from './render-variants'
import type { TimingInput, TimingPhases } from './run-timing'
import { aTimingRun } from './timing-run-fixture'
import type { SampleCounts } from './timing-record'

/** What the fake page reports about itself before it measures: the conditions and the description. */
export type Observation = Awaited<ReturnType<TimingPhases['observe']>>

/** The phases of a run, as the fake logs them. */
export type PhaseName =
  | 'observe'
  | 'planRedraw'
  | 'sceneUpdate'
  | 'renderFrames'
  | 'renderAfterEdits'

/** The samples of the frames of one fake variant or edit, in milliseconds. */
export interface FrameMilliseconds {
  mainThreadMs: number[]
  untilGpuDoneMs: number[]
}

const SERIES_STEP_MS = 0.3
const SERIES_SPIKE_MS = 3
const PLAN_REDRAW_BASE_MS = 7
const SCENE_UPDATE_BASE_MS = 1.5
const MAIN_THREAD_BASE_MS = 1
const GPU_DONE_BASE_MS = 4
const EDIT_FRAME_OFFSET_MS = 20
const FRAME_INTERVAL_MS = 10

/** Four samples from the base: two close ones, a slower one, and a spike, so p95 differs from the median. */
function seriesFrom(baseMs: number): number[] {
  return [
    baseMs,
    baseMs + SERIES_STEP_MS,
    baseMs + SERIES_STEP_MS + SERIES_STEP_MS,
    baseMs + SERIES_SPIKE_MS,
  ]
}

/** The plan redraw samples the fake returns. */
export const FAKE_PLAN_REDRAW_MS = seriesFrom(PLAN_REDRAW_BASE_MS)

/** The scene update samples the fake returns for the edit at the index of REFERENCE_EDITS. */
export function fakeSceneUpdateMs(editIndex: number): number[] {
  return seriesFrom(SCENE_UPDATE_BASE_MS + editIndex)
}

/** The frame samples the fake returns for the variant at the index of RENDER_VARIANTS. */
export function fakeVariantFrameMs(variantIndex: number): FrameMilliseconds {
  return {
    mainThreadMs: seriesFrom(MAIN_THREAD_BASE_MS + variantIndex),
    untilGpuDoneMs: seriesFrom(GPU_DONE_BASE_MS + variantIndex),
  }
}

/** The frame samples the fake returns for the edit at the index of REFERENCE_EDITS. */
export function fakeEditFrameMs(editIndex: number): FrameMilliseconds {
  return {
    mainThreadMs: seriesFrom(MAIN_THREAD_BASE_MS + EDIT_FRAME_OFFSET_MS + editIndex),
    untilGpuDoneMs: seriesFrom(GPU_DONE_BASE_MS + EDIT_FRAME_OFFSET_MS + editIndex),
  }
}

/** Complete, visible frames with the given times. */
export function framesOf({ mainThreadMs, untilGpuDoneMs }: FrameMilliseconds): FrameSample[] {
  return mainThreadMs.map((mainThread, index) => ({
    startMs: index * FRAME_INTERVAL_MS,
    mainThreadMs: mainThread,
    untilGpuDoneMs: untilGpuDoneMs[index] ?? null,
    gpuLost: false,
    hidden: false,
  }))
}

/** The frames of every render variant, by variant name, in the order of RENDER_VARIANTS. */
export function fakeVariantFrames(): Record<string, FrameSample[]> {
  return Object.fromEntries(
    RENDER_VARIANTS.map((variant, index) => [variant.name, framesOf(fakeVariantFrameMs(index))]),
  )
}

/** The frames after every reference edit, by edit name, in the order of REFERENCE_EDITS. */
export function fakeEditFrames(): Record<string, FrameSample[]> {
  return Object.fromEntries(
    REFERENCE_EDITS.map((edit, index) => [edit.name, framesOf(fakeEditFrameMs(index))]),
  )
}

/** A copy of the frames in which every frame of the named entry goes through the change. */
export function changingFrames(
  frames: Record<string, FrameSample[]>,
  name: string,
  change: (frame: FrameSample, index: number) => FrameSample,
): Record<string, FrameSample[]> {
  return Object.fromEntries(
    Object.entries(frames).map(([key, list]) => [key, key === name ? list.map(change) : list]),
  )
}

/** Good conditions on the machine of the fixture run: a production build on a hardware adapter. */
export function fakeObservation(): Observation {
  const { machine, conditions, build, takenAt } = aTimingRun()
  return {
    productionBuild: true,
    webGpuAdapter: { name: machine.webGpuAdapter, isFallback: false },
    visible: true,
    everHidden: false,
    displayFrameMs: conditions.displayFrameMs,
    takenAt,
    timerResolutionMs: build.timerResolutionMs,
    webGlRenderer: machine.webGlRenderer,
    focused: conditions.focused,
    power: conditions.power,
    devicePixelRatio: conditions.devicePixelRatio,
    planCanvasPx: conditions.planCanvasPx,
    sceneCanvasCssPx: conditions.sceneCanvasCssPx,
    sceneDrawingBufferPx: conditions.sceneDrawingBufferPx,
  }
}

/** The input of a normal run with no baseline, on the host of the fixture run. */
export function timingInput(changes: Partial<TimingInput> = {}): TimingInput {
  const { commit, uncommittedChanges, machine } = aTimingRun()
  const { processor, logicalCores, memoryGiB, operatingSystem, browser } = machine
  return {
    quick: false,
    baselineText: null,
    host: {
      commit,
      uncommittedChanges,
      processor,
      logicalCores,
      memoryGiB,
      operatingSystem,
      browser,
    },
    ...changes,
  }
}

/** What a test changes in the fake page. */
export interface FakeOptions {
  /** Changes to the description of the page at both observations. */
  observed?: Partial<Observation>
  /** Further changes to the description at the second observation only, after the last phase. */
  observedAtEnd?: Partial<Observation>
  planRedraw?: number[]
  sceneUpdate?: Record<string, number[]>
  renderFrames?: Record<string, FrameSample[]>
  renderAfterEdits?: Record<string, FrameSample[]>
  /** The phase that rejects with the error when it is called. */
  failIn?: { phase: PhaseName; error: Error }
}

/** The phases, the log of their calls in order, and the counts each measuring phase was given. */
export interface FakeTiming {
  phases: TimingPhases
  calls: PhaseName[]
  counts: Partial<Record<PhaseName, SampleCounts>>
}

/** Fake phases that log their calls and return fixed samples, one list for each edit or variant. */
export function fakeTimingPhases(options: FakeOptions = {}): FakeTiming {
  const calls: PhaseName[] = []
  let observations = 0
  const counts: Partial<Record<PhaseName, SampleCounts>> = {}
  function step<Result>(phase: PhaseName, result: Result, given?: SampleCounts): Promise<Result> {
    calls.push(phase)
    if (given !== undefined) counts[phase] = given
    return options.failIn?.phase === phase
      ? Promise.reject(options.failIn.error)
      : Promise.resolve(result)
  }
  const phases: TimingPhases = {
    observe: () => {
      observations += 1
      const atEnd = observations > 1 ? options.observedAtEnd : undefined
      return step('observe', { ...fakeObservation(), ...options.observed, ...atEnd })
    },
    planRedraw: (given) => step('planRedraw', options.planRedraw ?? FAKE_PLAN_REDRAW_MS, given),
    sceneUpdate: (given) =>
      step(
        'sceneUpdate',
        options.sceneUpdate ??
          Object.fromEntries(REFERENCE_EDITS.map((edit, i) => [edit.name, fakeSceneUpdateMs(i)])),
        given,
      ),
    renderFrames: (given) =>
      step('renderFrames', options.renderFrames ?? fakeVariantFrames(), given),
    renderAfterEdits: (given) =>
      step('renderAfterEdits', options.renderAfterEdits ?? fakeEditFrames(), given),
  }
  return { phases, calls, counts }
}
