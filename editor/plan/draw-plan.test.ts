import { describe, it, expect } from 'vitest'
import { drawGrid, drawPlan, drawRulers, type PlanDrawingContext } from './draw-plan'
import { DEFAULT_PLAN_SCALE, worldToScreen } from './viewport'
import type { RoomSceneNode, WallSceneNode } from '../../core'

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
  const texts: { text: string; x: number; y: number }[] = []
  const fillRects: { x: number; y: number; w: number; h: number }[] = []
  const ops: string[] = []
  let clears = 0
  let pen: [number, number] = [0, 0]
  const ctx: PlanDrawingContext = {
    lineWidth: 0,
    lineCap: 'butt',
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    clearRect: () => {
      ops.push('clearRect')
      clears += 1
    },
    beginPath: () => {
      ops.push('beginPath')
    },
    moveTo: (x, y) => {
      ops.push('moveTo')
      pen = [x, y]
    },
    lineTo: (x, y) => {
      ops.push('lineTo')
      segments.push({ from: pen, to: [x, y], style: String(ctx.strokeStyle) })
    },
    closePath: () => {
      ops.push('closePath')
    },
    stroke: () => {
      ops.push('stroke')
    },
    arc: (x, y, radius) => {
      ops.push('arc')
      arcs.push({ x, y, radius, fillStyle: String(ctx.fillStyle) })
    },
    fill: () => {
      ops.push('fill')
    },
    fillText: (text, x, y) => {
      ops.push('fillText')
      texts.push({ text, x, y })
    },
    fillRect: (x, y, w, h) => {
      ops.push('fillRect')
      fillRects.push({ x, y, w, h })
    },
  }
  return {
    ctx,
    segments,
    arcs,
    texts,
    fillRects,
    ops,
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

  it('fills each room polygon beneath the wall strokes', () => {
    const recorder = recordingContext()
    const room: RoomSceneNode = {
      id: 'room:r',
      kind: 'room',
      floorId: 'f',
      polygon: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      area: 12_000_000,
    }
    const secondRoom: RoomSceneNode = {
      id: 'room:s',
      kind: 'room',
      floorId: 'f',
      polygon: [
        { x: 5000, y: 0 },
        { x: 9000, y: 0 },
        { x: 9000, y: 3000 },
        { x: 5000, y: 3000 },
      ],
      area: 12_000_000,
    }
    const roomWall: WallSceneNode = {
      id: 'w1',
      kind: 'wall',
      floorId: 'f',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
      thickness: 114,
    }

    drawPlan(recorder.ctx, {
      walls: [roomWall],
      rooms: [room, secondRoom],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set<string>(),
    })

    const { ops } = recorder
    expect(ops).toContain('fill')
    expect(ops).toContain('closePath')
    expect(ops.lastIndexOf('fill')).toBeLessThan(ops.indexOf('stroke'))
  })
})

describe('drawGrid', () => {
  it('strokes vertical and horizontal grid lines spanning the canvas in one color', () => {
    const recorder = recordingContext()

    drawGrid(recorder.ctx, { scale: 0.1, offset: { x: 0, y: 0 } }, { width: 100, height: 100 })

    // 6 verticals + 6 horizontals at 200 mm spacing across a 100 px (1000 mm) canvas
    expect(recorder.segments).toHaveLength(12)

    const styles = new Set(recorder.segments.map((segment) => segment.style))
    expect(styles.size).toBe(1)

    const verticals = recorder.segments.filter((segment) => segment.from[0] === segment.to[0])
    expect(verticals).toHaveLength(6)
    expect(verticals.every((segment) => segment.from[1] === 0 && segment.to[1] === 100)).toBe(true)
  })
})

describe('drawRulers', () => {
  it('fills the top and left ruler bands and draws raw-millimetre tick labels', () => {
    const recorder = recordingContext()

    drawRulers(recorder.ctx, { scale: 0.1, offset: { x: 0, y: 0 } }, { width: 100, height: 100 })

    // a band along the top and a band along the left
    expect(recorder.fillRects.length).toBeGreaterThanOrEqual(2)
    // a raw-millimetre tick label (the tick at world 200 mm) appears as text
    expect(recorder.texts.map((entry) => entry.text)).toContain('200')
  })
})
