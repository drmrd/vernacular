import { describe, expect, it } from 'vitest'
import { drawPlan, type DrawPlanOptions } from '../../../editor/plan/draw-plan'
import { recordingContext } from '../../../editor/plan/draw-plan-test-fixtures'
import { createReferenceProject } from '../reference-project'
import { referenceDrawOptions } from '../reference-plan-scene'
import { required } from '../required'
import { referenceDragFrames } from './scripted-drag'
import { timePlanRedraw } from './plan-redraw-timing'

const CLOCK_STEP_MS = 10
const DRAG_FRAME_COUNT = 8
const COUNTS = { warmup: 2, timed: 3 }

const project = createReferenceProject()
const groundFloor = required(
  project.floors.find((floor) => floor.id === 'floor-1'),
  'the ground floor',
)

/** What a drag changes from one frame to the next, and from the plan at rest. */
const DRAGGED_KEYS = ['preview', 'selectedIds', 'endpointHandles', 'surfacePaint'] as const

function withoutDraggedKeys(options: DrawPlanOptions): Partial<DrawPlanOptions> {
  const rest: Partial<DrawPlanOptions> = { ...options }
  for (const key of DRAGGED_KEYS) {
    delete rest[key]
  }
  return rest
}

function previewEndOf(options: DrawPlanOptions) {
  return required(options.preview, 'the preview of a drag frame').end
}

function frameAt(frames: readonly DrawPlanOptions[], index: number): DrawPlanOptions {
  return required(frames[index], `drag frame ${index}`)
}

describe('the scripted drag of the reference project', () => {
  const frames = referenceDragFrames(project, groundFloor, DRAG_FRAME_COUNT)

  it('gives one set of draw options for each requested frame', () => {
    expect(frames).toHaveLength(DRAG_FRAME_COUNT)
  })

  it('moves the preview end on every frame', () => {
    for (let index = 1; index < frames.length; index += 1) {
      expect(previewEndOf(frameAt(frames, index))).not.toEqual(
        previewEndOf(frameAt(frames, index - 1)),
      )
    }
  })

  it('shares the walls and the rooms between all frames, as a real drag does', () => {
    const first = frameAt(frames, 0)

    for (const frame of frames) {
      expect(frame.walls).toBe(first.walls)
      expect(frame.rooms).toBe(first.rooms)
    }
  })

  it('selects the first wall of the floor and shows its endpoint handles', () => {
    for (const frame of frames) {
      const firstWall = required(frame.walls[0], 'the first wall of the floor')

      expect(frame.endpointHandles).toEqual(firstWall)
      expect(frame.selectedIds).toEqual(new Set([firstWall.id]))
    }
  })

  it('differs from the plan at rest only in the preview, the selection, and the handles', () => {
    const atRest = referenceDrawOptions(project, groundFloor)

    for (const frame of frames) {
      expect(withoutDraggedKeys(frame)).toEqual(withoutDraggedKeys(atRest))
    }
  })

  it('paints the wall faces as the plan at rest does', () => {
    const atRest = referenceDrawOptions(project, groundFloor)
    const wall = required(atRest.walls[0], 'the first wall of the floor')

    for (const frame of frames) {
      expect(frame.surfacePaint?.treatmentForFace(wall.id, 'left')).toEqual(
        atRest.surfacePaint?.treatmentForFace(wall.id, 'left'),
      )
    }
  })

  it('is the same on every call', () => {
    const again = referenceDragFrames(project, groundFloor, DRAG_FRAME_COUNT)

    expect(withoutSurfacePaint(again)).toEqual(withoutSurfacePaint(frames))
  })
})

/** The frames without the paint lookup, a closure that never equals the one of another call. */
function withoutSurfacePaint(frames: readonly DrawPlanOptions[]) {
  return frames.map((frame) => {
    const rest: Partial<DrawPlanOptions> = { ...frame }
    delete rest.surfacePaint
    return rest
  })
}

/** A clock that returns 0, 10, 20, ... and notes how many clears the context had seen at each read. */
function steppingClock(clearCount: () => number) {
  const clearsAtRead: number[] = []
  const now = () => {
    const reading = clearsAtRead.length * CLOCK_STEP_MS
    clearsAtRead.push(clearCount())
    return reading
  }
  return { now, clearsAtRead }
}

const nextFrameAtOnce = () => Promise.resolve()

async function timeWithRecorder() {
  const recorder = recordingContext()
  const clock = steppingClock(recorder.clearCount)
  const frames = referenceDragFrames(project, groundFloor, COUNTS.warmup + COUNTS.timed)
  const samples = await timePlanRedraw({
    ctx: recorder.ctx,
    frames,
    counts: COUNTS,
    now: clock.now,
    nextFrame: nextFrameAtOnce,
  })
  return { recorder, clock, frames, samples }
}

describe('timing the redraw of the plan', () => {
  it('returns one sample per timed frame, the difference of the clock reads around its draw', async () => {
    const { samples } = await timeWithRecorder()

    expect(samples).toEqual([CLOCK_STEP_MS, CLOCK_STEP_MS, CLOCK_STEP_MS])
  })

  it('holds exactly one whole draw of the plan in each timed interval', async () => {
    const { clock } = await timeWithRecorder()

    // Reads come in pairs, before and after a draw. One clear between the reads of a pair
    // means one drawPlan call inside it; the same count before the next pair means nothing drew between.
    const pairs = [0, 2, 4].map((first) => [
      clock.clearsAtRead[first],
      clock.clearsAtRead[first + 1],
    ])
    for (const [before, after] of pairs) {
      expect((after ?? 0) - (before ?? 0)).toBe(1)
    }
  })

  it('draws the warm-up frames before the first clock read, and reads the clock only around timed draws', async () => {
    const { clock, recorder } = await timeWithRecorder()

    // The surface says one sample per timed frame, so warm-up draws are untimed: no read happens
    // while they draw. That is an inference from the surface, not a stated rule.
    expect(clock.clearsAtRead[0]).toBe(COUNTS.warmup)
    expect(clock.clearsAtRead).toHaveLength(COUNTS.timed * 2)
    expect(recorder.clearCount()).toBe(COUNTS.warmup + COUNTS.timed)
  })

  it('draws the frames of the drag in order', async () => {
    const { recorder, frames } = await timeWithRecorder()

    const drawnAlone = frames.map((frame) => {
      const alone = recordingContext()
      drawPlan(alone.ctx, frame)
      return alone.segments
    })

    expect(drawnAlone[0]).not.toEqual(drawnAlone[1])
    expect(recorder.segments).toEqual(drawnAlone.flat())
  })

  it('refuses a redraw with no frame to draw, rather than report no samples', async () => {
    const recorder = recordingContext()

    await expect(
      timePlanRedraw({
        ctx: recorder.ctx,
        frames: [],
        counts: COUNTS,
        now: () => 0,
        nextFrame: nextFrameAtOnce,
      }),
    ).rejects.toThrow(/frame/i)
  })
})
