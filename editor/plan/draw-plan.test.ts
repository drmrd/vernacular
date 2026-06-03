import { describe, it, expect } from 'vitest'
import { drawPlan, type PlanDrawingContext } from './draw-plan'
import { DEFAULT_PLAN_SCALE } from './viewport'
import type { WallSceneNode } from '../../core'

interface DrawnSegment {
  from: [number, number]
  to: [number, number]
  style: string
}

function recordingContext() {
  const segments: DrawnSegment[] = []
  let clears = 0
  let pen: [number, number] = [0, 0]
  const ctx: PlanDrawingContext = {
    lineWidth: 0,
    lineCap: 'butt',
    strokeStyle: '',
    clearRect: () => {
      clears += 1
    },
    beginPath: () => {},
    moveTo: (x, y) => {
      pen = [x, y]
    },
    lineTo: (x, y) => {
      segments.push({ from: pen, to: [x, y], style: String(ctx.strokeStyle) })
    },
    stroke: () => {},
  }
  return {
    ctx,
    segments,
    clearCount: () => clears,
  }
}

const wall: WallSceneNode = {
  id: 'wall:a',
  kind: 'wall',
  floorId: 'g',
  start: { x: 0, y: 0 },
  end: { x: 1000, y: 0 },
  thickness: 114,
}

describe('drawPlan', () => {
  it('clears the surface and strokes each wall projected to screen space', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, {
      walls: [wall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set(),
    })

    expect(recorder.clearCount()).toBe(1)
    expect(recorder.segments).toHaveLength(1)
    expect(recorder.segments[0]?.from).toEqual([0, 0])
    expect(recorder.segments[0]?.to).toEqual([1000 * DEFAULT_PLAN_SCALE, 0])
  })

  it('strokes a selected wall in a different color than an unselected one', () => {
    const unselected = recordingContext()
    drawPlan(unselected.ctx, {
      walls: [wall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set(),
    })

    const selected = recordingContext()
    drawPlan(selected.ctx, {
      walls: [wall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set(['wall:a']),
    })

    expect(selected.segments[0]?.style).not.toBe(unselected.segments[0]?.style)
  })
})
