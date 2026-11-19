import { describe, expect, it } from 'vitest'
import { REFERENCE_EDITS } from '../reference-project'
import {
  changingFrames,
  fakeEditFrames,
  fakeObservation,
  fakeSceneUpdateMs,
  fakeTimingPhases,
  fakeVariantFrames,
  timingInput,
} from './fake-timing-phases'
import type { Observation, PhaseName } from './fake-timing-phases'
import type { FrameSample } from './frame-probe'
import { RENDER_VARIANTS } from './render-variants'
import { runTiming } from './run-timing'
import type { TimingOutcome } from './run-timing'

const VARIANT_NAMES = RENDER_VARIANTS.map((variant) => variant.name)
const EDIT_NAMES = REFERENCE_EDITS.map((edit) => edit.name)
const VARIANT = VARIANT_NAMES[2] ?? ''
const EDIT = EDIT_NAMES[1] ?? ''
const MEASURING_PHASES: PhaseName[] = [
  'planRedraw',
  'sceneUpdate',
  'renderFrames',
  'renderAfterEdits',
]

function refusalText(outcome: TimingOutcome): string {
  if (outcome.kind !== 'refused') throw new Error('Expected the run to be refused')
  return outcome.reasons.join('\n')
}

function without<Value>(record: Record<string, Value>, name: string): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== name))
}

const noFrames = (frames: Record<string, FrameSample[]>, name: string) => ({
  ...frames,
  [name]: [],
})

const firstFrameWithoutGpuWork = (frame: FrameSample, index: number): FrameSample =>
  index === 0 ? { ...frame, untilGpuDoneMs: null } : frame

const withoutGpuWork = (frame: FrameSample): FrameSample => ({ ...frame, untilGpuDoneMs: null })

describe('a timing run observes the page at its start and at its end', () => {
  it('observes before the first phase and again after the last one', async () => {
    const fake = fakeTimingPhases()
    await runTiming(fake.phases, timingInput())
    expect(fake.calls).toEqual(['observe', ...MEASURING_PHASES, 'observe'])
  })

  it.each([
    ['not visible', { visible: false }],
    ['marked as hidden at some time', { everHidden: true }],
  ])(
    'refuses a run whose window was %s at its end, and keeps no record',
    async (_name, observedAtEnd) => {
      const outcome = await runTiming(fakeTimingPhases({ observedAtEnd }).phases, timingInput())
      expect(outcome.kind).toBe('refused')
      expect(refusalText(outcome)).toMatch(/hidden during the run/i)
      expect(outcome).not.toHaveProperty('run')
    },
  )

  it('refuses a window that was hidden before the run started, before any phase runs', async () => {
    const fake = fakeTimingPhases({ observed: { everHidden: true } })
    const outcome = await runTiming(fake.phases, timingInput())
    expect(refusalText(outcome)).toMatch(/hidden/i)
    expect(fake.calls).toEqual(['observe'])
  })

  it('records a window that stayed visible and focused as visible throughout and focused', async () => {
    const fake = fakeTimingPhases({ observed: { focused: true } })
    const outcome = await runTiming(fake.phases, timingInput())
    if (outcome.kind !== 'measured') throw new Error('Expected a measured run')
    expect(outcome.run.conditions).toMatchObject({ visibleThroughout: true, focused: true })
  })

  it.each([
    ['at its end', { focused: true }, { focused: false }],
    ['at its start', { focused: false }, { focused: true }],
  ])(
    'records the run as not focused when the window lost focus %s, and still measures it',
    async (_name, atStart, observedAtEnd) => {
      const fake = fakeTimingPhases({ observed: atStart, observedAtEnd })
      const outcome = await runTiming(fake.phases, timingInput())
      if (outcome.kind !== 'measured') throw new Error('Expected a measured run')
      expect(outcome.run.conditions.focused).toBe(false)
      expect(outcome.run.conditions.visibleThroughout).toBe(true)
    },
  )
})

describe('the record of a timing run takes its sizes from the end observation', () => {
  async function recordOf(observedAtEnd: Partial<Observation>) {
    const outcome = await runTiming(fakeTimingPhases({ observedAtEnd }).phases, timingInput())
    if (outcome.kind !== 'measured') throw new Error('Expected a measured run')
    return outcome.run
  }

  it('holds the pixel ratio and the three canvas sizes that the page states at its end', async () => {
    const atEnd = {
      devicePixelRatio: 3,
      planCanvasPx: { width: 640, height: 480 },
      sceneCanvasCssPx: { width: 1024, height: 700 },
      sceneDrawingBufferPx: { width: 3072, height: 2100 },
    }

    const { conditions } = await recordOf(atEnd)

    expect({
      devicePixelRatio: conditions.devicePixelRatio,
      planCanvasPx: conditions.planCanvasPx,
      sceneCanvasCssPx: conditions.sceneCanvasCssPx,
      sceneDrawingBufferPx: conditions.sceneDrawingBufferPx,
    }).toEqual(atEnd)
  })

  it('keeps the display frame, the time, and the machine facts of the start observation', async () => {
    const atStart = fakeObservation()

    const run = await recordOf({
      displayFrameMs: 16.67,
      takenAt: '2026-11-21T23:59:59-05:00',
      webGlRenderer: 'a renderer that the page names only at its end',
      webGpuAdapter: { name: 'another / adapter / name', isFallback: false },
      timerResolutionMs: 0.1,
    })

    expect({
      displayFrameMs: run.conditions.displayFrameMs,
      takenAt: run.takenAt,
      webGlRenderer: run.machine.webGlRenderer,
      webGpuAdapter: run.machine.webGpuAdapter,
      timerResolutionMs: run.build.timerResolutionMs,
    }).toEqual({
      displayFrameMs: atStart.displayFrameMs,
      takenAt: atStart.takenAt,
      webGlRenderer: atStart.webGlRenderer,
      webGpuAdapter: atStart.webGpuAdapter?.name,
      timerResolutionMs: atStart.timerResolutionMs,
    })
  })
})

describe('a timing run with odd frame results', () => {
  it.each([
    ['a variant', { renderFrames: noFrames(fakeVariantFrames(), VARIANT) }, VARIANT],
    ['an edit after the edit', { renderAfterEdits: noFrames(fakeEditFrames(), EDIT) }, EDIT],
  ])(
    'refuses %s with no frames, names it, and does not blame WebGL 2',
    async (_n, options, name) => {
      const text = refusalText(await runTiming(fakeTimingPhases(options).phases, timingInput()))
      expect(text).toContain('no frames')
      expect(text).toContain(name)
      expect(text).not.toContain('WebGL 2')
    },
  )

  it.each([
    [
      'a variant',
      { renderFrames: changingFrames(fakeVariantFrames(), VARIANT, firstFrameWithoutGpuWork) },
      VARIANT,
    ],
    [
      'an edit',
      { renderAfterEdits: changingFrames(fakeEditFrames(), EDIT, firstFrameWithoutGpuWork) },
      EDIT,
    ],
  ])('refuses %s where only some frames made GPU work, and names it', async (_n, options, name) => {
    const text = refusalText(await runTiming(fakeTimingPhases(options).phases, timingInput()))
    expect(text).toContain(name)
    expect(text).toMatch(/some frames made no GPU work/i)
  })

  it('refuses an edit whose frames all made no GPU work, as a WebGL 2 fallback', async () => {
    const renderAfterEdits = changingFrames(fakeEditFrames(), EDIT, withoutGpuWork)
    const outcome = await runTiming(fakeTimingPhases({ renderAfterEdits }).phases, timingInput())
    expect(refusalText(outcome)).toContain('WebGL 2')
  })
})

describe('a timing run whose phases return incomplete results', () => {
  it('rejects with an error naming the plan redraw when it returns no samples', async () => {
    const fake = fakeTimingPhases({ planRedraw: [] })
    await expect(runTiming(fake.phases, timingInput())).rejects.toThrow(/plan redraw/i)
  })

  it('rejects with an error naming the 3D update and the edit when an edit has no samples', async () => {
    const sceneUpdate = { ...fakeSceneUpdates(), [EDIT]: [] }
    const fake = fakeTimingPhases({ sceneUpdate })
    const rejection = expect(runTiming(fake.phases, timingInput())).rejects
    await rejection.toThrow(/3D update/i)
    await rejection.toThrow(EDIT)
  })

  it.each([
    ['a render variant', VARIANT, { renderFrames: without(fakeVariantFrames(), VARIANT) }],
    [
      'an edit of the frames after edits',
      EDIT,
      { renderAfterEdits: without(fakeEditFrames(), EDIT) },
    ],
    ['an edit of the 3D update', EDIT, { sceneUpdate: without(fakeSceneUpdates(), EDIT) }],
  ])(
    'rejects with an error naming the missing entry when %s is absent',
    async (_n, name, options) => {
      const fake = fakeTimingPhases(options)
      await expect(runTiming(fake.phases, timingInput())).rejects.toThrow(name)
    },
  )
})

function fakeSceneUpdates(): Record<string, number[]> {
  return Object.fromEntries(REFERENCE_EDITS.map((edit, i) => [edit.name, fakeSceneUpdateMs(i)]))
}
