import { describe, expect, it } from 'vitest'
import { REFERENCE_EDITS } from '../reference-project'
import {
  changingFrames,
  fakeEditFrameMs,
  fakeEditFrames,
  fakeObservation,
  fakeSceneUpdateMs,
  fakeTimingPhases,
  fakeVariantFrameMs,
  fakeVariantFrames,
  FAKE_PLAN_REDRAW_MS,
  timingInput,
} from './fake-timing-phases'
import type { FrameMilliseconds, PhaseName } from './fake-timing-phases'
import type { FrameSample } from './frame-probe'
import { RENDER_VARIANTS } from './render-variants'
import { runRefusals } from './run-conditions'
import { runTiming } from './run-timing'
import type { TimingOutcome } from './run-timing'
import { formatTimingReport } from './timing-report'
import { parseTimingRun, serializeTimingRun } from './timing-record'
import { aTimingRun } from './timing-run-fixture'
import { summarizeSamples } from './timing-statistics'

const VARIANT_NAMES = RENDER_VARIANTS.map((variant) => variant.name)
const EDIT_NAMES = REFERENCE_EDITS.map((edit) => edit.name)
const MEASURING_PHASES: PhaseName[] = [
  'planRedraw',
  'sceneUpdate',
  'renderFrames',
  'renderAfterEdits',
]

function measured(outcome: TimingOutcome): Extract<TimingOutcome, { kind: 'measured' }> {
  if (outcome.kind !== 'measured')
    throw new Error(`Expected a measured run: ${JSON.stringify(outcome)}`)
  return outcome
}

function refusalText(outcome: TimingOutcome): string {
  if (outcome.kind !== 'refused') throw new Error('Expected the run to be refused')
  return outcome.reasons.join('\n')
}

function summarizedFrames({ mainThreadMs, untilGpuDoneMs }: FrameMilliseconds) {
  return {
    mainThread: summarizeSamples(mainThreadMs),
    untilGpuDone: summarizeSamples(untilGpuDoneMs),
  }
}

describe('a timing run that cannot be trusted', () => {
  it.each([
    ['a development build', { productionBuild: false }],
    ['no WebGPU adapter', { webGpuAdapter: null }],
    ['a throttled display', { displayFrameMs: 50 }],
  ])(
    'refuses %s with the reasons of the conditions and measures nothing',
    async (_name, observed) => {
      const fake = fakeTimingPhases({ observed })
      const outcome = await runTiming(fake.phases, timingInput())
      const reasons = runRefusals({ ...fakeObservation(), ...observed })
      expect(reasons).not.toEqual([])
      expect(outcome).toEqual({ kind: 'refused', reasons })
      expect(fake.calls).toEqual(['observe'])
    },
  )

  it.each(['not a record at all', '{"format": 1}'])(
    'refuses an invalid baseline text (%s) before any phase runs, naming the baseline',
    async (baselineText) => {
      const fake = fakeTimingPhases()
      const outcome = await runTiming(fake.phases, timingInput({ baselineText }))
      expect(refusalText(outcome)).toMatch(/baseline/i)
      expect(fake.calls).toEqual([])
    },
  )

  it.each(['renderFrames', 'renderAfterEdits'] as const)(
    'refuses when the window was hidden at a frame of %s',
    async (phase) => {
      const hide = (frame: FrameSample, index: number) =>
        index === 0 ? { ...frame, hidden: true } : frame
      const options =
        phase === 'renderFrames'
          ? { renderFrames: changingFrames(fakeVariantFrames(), VARIANT_NAMES[1] ?? '', hide) }
          : { renderAfterEdits: changingFrames(fakeEditFrames(), EDIT_NAMES[2] ?? '', hide) }
      const outcome = await runTiming(fakeTimingPhases(options).phases, timingInput())
      expect(outcome.kind).toBe('refused')
      expect(refusalText(outcome)).toMatch(/hidden/i)
    },
  )

  it('refuses when the device was lost at a frame of any render phase', async () => {
    const lose = (frame: FrameSample, index: number) =>
      index === 0 ? { ...frame, gpuLost: true, untilGpuDoneMs: null } : frame
    const inVariants = {
      renderFrames: changingFrames(fakeVariantFrames(), VARIANT_NAMES[0] ?? '', lose),
    }
    const inEdits = {
      renderAfterEdits: changingFrames(fakeEditFrames(), EDIT_NAMES[0] ?? '', lose),
    }
    for (const options of [inVariants, inEdits]) {
      const outcome = await runTiming(fakeTimingPhases(options).phases, timingInput())
      expect(outcome.kind).toBe('refused')
      expect(refusalText(outcome)).toMatch(/GPU device was lost/i)
    }
  })

  it('refuses a variant whose frames never reached the GPU queue, as a WebGL 2 fallback', async () => {
    const renderFrames = changingFrames(fakeVariantFrames(), VARIANT_NAMES[3] ?? '', (frame) => ({
      ...frame,
      untilGpuDoneMs: null,
    }))
    const outcome = await runTiming(fakeTimingPhases({ renderFrames }).phases, timingInput())
    expect(outcome.kind).toBe('refused')
    expect(refusalText(outcome)).toContain('WebGL 2')
  })

  it.each(['observe', ...MEASURING_PHASES] as const)(
    'rejects with the error of a phase that throws (%s)',
    async (phase) => {
      const error = new Error(`the ${phase} phase broke`)
      const fake = fakeTimingPhases({ failIn: { phase, error } })
      await expect(runTiming(fake.phases, timingInput())).rejects.toBe(error)
    },
  )
})

describe('a timing run under good conditions', () => {
  it('runs the phases in the fixed order: conditions, plan redraw, 3D update, frames, frames after edits', async () => {
    const fake = fakeTimingPhases()
    await runTiming(fake.phases, timingInput())
    expect(fake.calls).toEqual(['observe', ...MEASURING_PHASES])
  })

  it.each([
    [
      false,
      {
        planRedraw: { warmup: 60, timed: 300 },
        sceneUpdate: { warmup: 10, timed: 100 },
        renderFrame: { warmup: 120, timed: 300 },
        afterEditTimed: 30,
      },
    ],
    [
      true,
      {
        planRedraw: { warmup: 10, timed: 30 },
        sceneUpdate: { warmup: 10, timed: 10 },
        renderFrame: { warmup: 12, timed: 30 },
        afterEditTimed: 10,
      },
    ],
  ])(
    'measures with quick %s: the record keeps the counts and the summaries of the samples',
    async (quick, counts) => {
      const fake = fakeTimingPhases()
      const input = timingInput({ quick })
      const outcome = measured(await runTiming(fake.phases, input))
      const { host } = input
      const observed = fakeObservation()
      expect(outcome.run).toEqual({
        format: 1,
        quick,
        commit: host.commit,
        uncommittedChanges: host.uncommittedChanges,
        takenAt: observed.takenAt,
        build: { mode: 'production', timerResolutionMs: observed.timerResolutionMs },
        machine: {
          processor: host.processor,
          logicalCores: host.logicalCores,
          memoryGiB: host.memoryGiB,
          operatingSystem: host.operatingSystem,
          browser: host.browser,
          webGpuAdapter: observed.webGpuAdapter?.name,
          webGlRenderer: observed.webGlRenderer,
          renderer: 'webgpu',
        },
        conditions: {
          visibleThroughout: true,
          focused: observed.focused,
          power: observed.power,
          devicePixelRatio: observed.devicePixelRatio,
          displayFrameMs: observed.displayFrameMs,
          planCanvasPx: observed.planCanvasPx,
          sceneCanvasCssPx: observed.sceneCanvasCssPx,
          sceneDrawingBufferPx: observed.sceneDrawingBufferPx,
        },
        method: {
          planRedraw: counts.planRedraw,
          sceneUpdate: counts.sceneUpdate,
          renderFrame: counts.renderFrame,
          renderAfterEdit: expect.objectContaining({ timed: counts.afterEditTimed }),
        },
        times: {
          planRedraw: summarizeSamples(FAKE_PLAN_REDRAW_MS),
          sceneUpdate: Object.fromEntries(
            EDIT_NAMES.map((name, index) => [name, summarizeSamples(fakeSceneUpdateMs(index))]),
          ),
          renderFrame: Object.fromEntries(
            VARIANT_NAMES.map((name, index) => [name, summarizedFrames(fakeVariantFrameMs(index))]),
          ),
          renderAfterEdit: Object.fromEntries(
            EDIT_NAMES.map((name, index) => [name, summarizedFrames(fakeEditFrameMs(index))]),
          ),
        },
      })
      const { method } = outcome.run
      expect(fake.counts).toEqual({
        planRedraw: method.planRedraw,
        sceneUpdate: method.sceneUpdate,
        renderFrames: method.renderFrame,
        renderAfterEdits: method.renderAfterEdit,
      })
    },
  )

  it('keeps the entries of the record in the order of the variants and of the edits', async () => {
    const { run } = measured(await runTiming(fakeTimingPhases().phases, timingInput()))
    expect(Object.keys(run.times.renderFrame)).toEqual(VARIANT_NAMES)
    expect(Object.keys(run.times.sceneUpdate)).toEqual(EDIT_NAMES)
    expect(Object.keys(run.times.renderAfterEdit)).toEqual(EDIT_NAMES)
  })

  it('gives a record text that reads back as the same run', async () => {
    const { run, recordText } = measured(await runTiming(fakeTimingPhases().phases, timingInput()))
    expect(recordText).toBe(serializeTimingRun(run))
    expect(parseTimingRun(JSON.parse(serializeTimingRun(run)))).toEqual(run)
  })

  it('reports the run against no baseline when the baseline text is absent', async () => {
    const { run, report } = measured(await runTiming(fakeTimingPhases().phases, timingInput()))
    expect(report).toBe(formatTimingReport(run, undefined))
  })

  it('reports the run against the parsed baseline, with its warnings', async () => {
    const baseline = aTimingRun()
    baseline.machine.processor = 'Another processor'
    const baselineText = serializeTimingRun(baseline)
    const { run, report } = measured(
      await runTiming(fakeTimingPhases().phases, timingInput({ baselineText })),
    )
    expect(report).toBe(formatTimingReport(run, parseTimingRun(JSON.parse(baselineText))))
    expect(report).toContain('Another processor')
  })
})
