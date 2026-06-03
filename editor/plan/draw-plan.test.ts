import { describe, it, expect } from 'vitest'
import { drawPlan, type PlanDrawingContext } from './draw-plan'
import { DEFAULT_PLAN_SCALE, worldToScreen } from './viewport'
import type { WallSceneNode } from '../../core'

interface DrawnSegment {
  from: [number, number]
  to: [number, number]
  style: string
}

interface DrawnArc {
  x: number
  y: number
  radius: number
  fillStyle: string
}

function recordingContext() {
  const segments: DrawnSegment[] = []
  const arcs: DrawnArc[] = []
  let clears = 0
  let pen: [number, number] = [0, 0]
  const ctx: PlanDrawingContext = {
    lineWidth: 0,
    lineCap: 'butt',
    strokeStyle: '',
    fillStyle: '',
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
    arc: (x, y, radius) => {
      arcs.push({ x, y, radius, fillStyle: String(ctx.fillStyle) })
    },
    fill: () => {},
  }
  return {
    ctx,
    segments,
    arcs,
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

  it('draws a preview guide line and a start marker when a preview segment is provided', () => {
    const recorder = recordingContext()
    const viewport = { scale: DEFAULT_PLAN_SCALE }
    const preview = { start: { x: 1000, y: 2000 }, end: { x: 5000, y: 2000 } }

    drawPlan(recorder.ctx, {
      walls: [wall],
      viewport,
      width: 800,
      height: 600,
      selectedIds: new Set(),
      preview,
    })

    const wallSegment = recorder.segments[0]
    const previewSegment = recorder.segments[recorder.segments.length - 1]
    const previewStart = worldToScreen(preview.start, viewport)
    const previewEnd = worldToScreen(preview.end, viewport)

    expect(previewSegment?.from).toEqual([previewStart.x, previewStart.y])
    expect(previewSegment?.to).toEqual([previewEnd.x, previewEnd.y])
    expect(previewSegment?.style).not.toBe(wallSegment?.style)

    expect(recorder.arcs).toHaveLength(1)
    expect(recorder.arcs[0]?.x).toBe(previewStart.x)
    expect(recorder.arcs[0]?.y).toBe(previewStart.y)
  })
})
