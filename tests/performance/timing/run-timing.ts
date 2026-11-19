import { REFERENCE_EDITS } from '../reference-project'
import type { FrameSample } from './frame-probe'
import { RENDER_VARIANTS } from './render-variants'
import { runRefusals } from './run-conditions'
import type { ObservedConditions } from './run-conditions'
import { formatTimingReport } from './timing-report'
import { parseTimingRun, serializeTimingRun } from './timing-record'
import type {
  FrameTiming,
  PixelSize,
  SampleCounts,
  TimingRun,
  TimingSummary,
} from './timing-record'
import { summarizeSamples } from './timing-statistics'

/** The share of a full run that a quick run takes: every count is divided by this. */
const QUICK_DIVISOR = 10
/** The fewest samples a phase takes in a quick run, so that a 95th percentile still means something. */
const QUICK_MINIMUM = 10

/** Plan redraw warm-up: the draws that fill the JIT and text-shaping caches. */
const PLAN_REDRAW_WARMUP = 60
/** Plan redraw timed: 300 samples leave 15 above the 95th percentile. */
const PLAN_REDRAW_TIMED = 300
/** Scene update warm-up per edit: the reconciler cache and the derivation caches fill. */
const SCENE_UPDATE_WARMUP = 10
/** Scene update timed per edit. */
const SCENE_UPDATE_TIMED = 100
/** Render frame warm-up: the shader and occlusion pipeline builds. */
const RENDER_FRAME_WARMUP = 120
/** Render frame timed: 300 samples leave 15 above the 95th percentile. */
const RENDER_FRAME_TIMED = 300
/** Render after edit warm-up: none, because each sample undoes its edit and lets frames pass. */
const RENDER_AFTER_EDIT_WARMUP = 0
/** Render after edit timed: each sample is one edit and one frame, so 30 keep the run short. */
const RENDER_AFTER_EDIT_TIMED = 30

/** The format number of a run file. */
const TIMING_RUN_FORMAT = 1

/** What only Node knows: commit, uncommitted changes, processor, cores, memory, OS, browser. */
export type HostDescription = Pick<TimingRun, 'commit' | 'uncommittedChanges'> &
  Pick<
    TimingRun['machine'],
    'processor' | 'logicalCores' | 'memoryGiB' | 'operatingSystem' | 'browser'
  >

/** What the page knows beyond the conditions of the run: clock, renderer, sizes, power. */
export interface PageDescription extends ObservedConditions {
  takenAt: string
  timerResolutionMs: number
  webGlRenderer: string
  focused: boolean
  power: TimingRun['conditions']['power']
  devicePixelRatio: number
  planCanvasPx: PixelSize
  sceneCanvasCssPx: PixelSize
  sceneDrawingBufferPx: PixelSize
}

/** The browser-side steps, injected so the order and the refusals can be tested in jsdom. */
export interface TimingPhases {
  observe(): Promise<PageDescription>
  planRedraw(counts: SampleCounts): Promise<number[]>
  sceneUpdate(counts: SampleCounts): Promise<Record<string, number[]>>
  renderFrames(counts: SampleCounts): Promise<Record<string, FrameSample[]>>
  renderAfterEdits(counts: SampleCounts): Promise<Record<string, FrameSample[]>>
}

/** What a run needs from its caller: the mode, the baseline file's text, and the host facts. */
export interface TimingInput {
  quick: boolean
  baselineText: string | null
  host: HostDescription
}

/** The result of a run: a record with its report, or the reasons that nothing was kept. */
export type TimingOutcome =
  | { kind: 'measured'; run: TimingRun; recordText: string; report: string }
  | { kind: 'refused'; reasons: string[] }

type Method = TimingRun['method']

function scaledForMode(count: number, quick: boolean): number {
  if (!quick || count === 0) return count
  return Math.max(QUICK_MINIMUM, Math.floor(count / QUICK_DIVISOR))
}

function countsFor(warmup: number, timed: number, quick: boolean): SampleCounts {
  return {
    warmup: scaledForMode(warmup, quick),
    timed: scaledForMode(timed, quick),
  }
}

function methodFor(quick: boolean): Method {
  return {
    planRedraw: countsFor(PLAN_REDRAW_WARMUP, PLAN_REDRAW_TIMED, quick),
    sceneUpdate: countsFor(SCENE_UPDATE_WARMUP, SCENE_UPDATE_TIMED, quick),
    renderFrame: countsFor(RENDER_FRAME_WARMUP, RENDER_FRAME_TIMED, quick),
    renderAfterEdit: countsFor(RENDER_AFTER_EDIT_WARMUP, RENDER_AFTER_EDIT_TIMED, quick),
  }
}

function parseBaseline(baselineText: string | null): TimingRun | undefined | string {
  if (baselineText === null) return undefined
  try {
    return parseTimingRun(JSON.parse(baselineText))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return `The baseline file is not a valid timing record, so nothing was measured: ${detail}`
  }
}

function hiddenRefusal(samples: readonly FrameSample[]): string | undefined {
  return samples.some((sample) => sample.hidden)
    ? 'The window was hidden during the run, so the times were discarded. ' +
        'Keep the browser window visible and in front for the whole run.'
    : undefined
}

function gpuLostRefusal(samples: readonly FrameSample[]): string | undefined {
  return samples.some((sample) => sample.gpuLost)
    ? 'The GPU device was lost during the run, so the times were discarded. ' +
        'Run again; if it repeats, update the graphics driver or the browser.'
    : undefined
}

function fallbackRefusal(name: string, samples: readonly FrameSample[]): string | undefined {
  const allWithoutGpuWork = samples.every((sample) => sample.untilGpuDoneMs === null)
  return allWithoutGpuWork
    ? `The frames of "${name}" made no WebGPU work, so the renderer fell back to WebGL 2 ` +
        'and the times were discarded. A fallback figure is never kept.'
    : undefined
}

function frameRefusals(frames: Record<string, FrameSample[]>): string[] {
  const all = Object.values(frames).flat()
  const reasons = [hiddenRefusal(all), gpuLostRefusal(all)]
  for (const [name, samples] of Object.entries(frames)) {
    reasons.push(fallbackRefusal(name, samples))
  }
  return reasons.filter((reason): reason is string => reason !== undefined)
}

function summarizedFrames(samples: readonly FrameSample[]): FrameTiming {
  return {
    mainThread: summarizeSamples(samples.map((sample) => sample.mainThreadMs)),
    untilGpuDone: summarizeSamples(
      samples.flatMap((sample) => (sample.untilGpuDoneMs === null ? [] : [sample.untilGpuDoneMs])),
    ),
  }
}

function samplesNamed<Samples>(byName: Record<string, Samples>, name: string): Samples {
  const samples = byName[name]
  if (samples === undefined) throw new Error(`The phase returned no samples for "${name}"`)
  return samples
}

function summarizedByName<Samples, Summary>(
  names: readonly string[],
  byName: Record<string, Samples>,
  summarize: (samples: Samples) => Summary,
): Record<string, Summary> {
  return Object.fromEntries(names.map((name) => [name, summarize(samplesNamed(byName, name))]))
}

interface PhaseSamples {
  planRedraw: number[]
  sceneUpdate: Record<string, number[]>
  renderFrame: Record<string, FrameSample[]>
  renderAfterEdit: Record<string, FrameSample[]>
}

function timesFrom(samples: PhaseSamples): TimingRun['times'] {
  const variantNames = RENDER_VARIANTS.map((variant) => variant.name)
  const editNames = REFERENCE_EDITS.map((edit) => edit.name)
  return {
    planRedraw: summarizeSamples(samples.planRedraw),
    sceneUpdate: summarizedByName(
      editNames,
      samples.sceneUpdate,
      (each): TimingSummary => summarizeSamples(each),
    ),
    renderFrame: summarizedByName(variantNames, samples.renderFrame, summarizedFrames),
    renderAfterEdit: summarizedByName(editNames, samples.renderAfterEdit, summarizedFrames),
  }
}

function machineFrom(host: HostDescription, page: PageDescription): TimingRun['machine'] {
  return {
    processor: host.processor,
    logicalCores: host.logicalCores,
    memoryGiB: host.memoryGiB,
    operatingSystem: host.operatingSystem,
    browser: host.browser,
    webGpuAdapter: page.webGpuAdapter?.name ?? '',
    webGlRenderer: page.webGlRenderer,
    renderer: 'webgpu',
  }
}

function conditionsFrom(page: PageDescription): TimingRun['conditions'] {
  return {
    visibleThroughout: true, // a run with a hidden frame is refused before the record
    focused: page.focused,
    power: page.power,
    devicePixelRatio: page.devicePixelRatio,
    displayFrameMs: page.displayFrameMs ?? 0,
    planCanvasPx: page.planCanvasPx,
    sceneCanvasCssPx: page.sceneCanvasCssPx,
    sceneDrawingBufferPx: page.sceneDrawingBufferPx,
  }
}

function recordFrom(
  input: TimingInput,
  page: PageDescription,
  measured: { method: Method; samples: PhaseSamples },
): TimingRun {
  const { host, quick } = input
  return {
    format: TIMING_RUN_FORMAT,
    quick,
    commit: host.commit,
    uncommittedChanges: host.uncommittedChanges,
    takenAt: page.takenAt,
    build: { mode: 'production', timerResolutionMs: page.timerResolutionMs },
    machine: machineFrom(host, page),
    conditions: conditionsFrom(page),
    method: measured.method,
    times: timesFrom(measured.samples),
  }
}

async function measure(phases: TimingPhases, method: Method): Promise<PhaseSamples> {
  const planRedraw = await phases.planRedraw(method.planRedraw)
  const sceneUpdate = await phases.sceneUpdate(method.sceneUpdate)
  const renderFrame = await phases.renderFrames(method.renderFrame)
  const renderAfterEdit = await phases.renderAfterEdits(method.renderAfterEdit)
  return { planRedraw, sceneUpdate, renderFrame, renderAfterEdit }
}

/** Runs the phases in the order of 2.5 and builds the record; refuses before measuring when it must. */
export async function runTiming(phases: TimingPhases, input: TimingInput): Promise<TimingOutcome> {
  const baseline = parseBaseline(input.baselineText)
  if (typeof baseline === 'string') return { kind: 'refused', reasons: [baseline] }
  const page = await phases.observe()
  const conditionRefusals = runRefusals(page)
  if (conditionRefusals.length > 0) return { kind: 'refused', reasons: conditionRefusals }
  const method = methodFor(input.quick)
  const samples = await measure(phases, method)
  const reasons = [...frameRefusals(samples.renderFrame), ...frameRefusals(samples.renderAfterEdit)]
  if (reasons.length > 0) return { kind: 'refused', reasons }
  const run = recordFrom(input, page, { method, samples })
  return {
    kind: 'measured',
    run,
    recordText: serializeTimingRun(run),
    report: formatTimingReport(run, baseline),
  }
}
