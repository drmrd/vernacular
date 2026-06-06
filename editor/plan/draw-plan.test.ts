import { describe, it, expect } from 'vitest'
import { drawGrid, drawMarquee, drawPlan, drawRulers, type PlanDrawingContext } from './draw-plan'
import { DEFAULT_PLAN_SCALE, worldToScreen } from './viewport'
import type { Bounds } from './fit'
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
    // eslint-disable-next-line max-params -- mirrors the four-argument CanvasRenderingContext2D.fillRect signature the fake records
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

function rectangleRoom(id: string, originX = 0): RoomSceneNode {
  return {
    id,
    kind: 'room',
    floorId: 'f',
    polygon: [
      { x: originX, y: 0 },
      { x: originX + 4000, y: 0 },
      { x: originX + 4000, y: 3000 },
      { x: originX, y: 3000 },
    ],
    area: 12_000_000,
  }
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
      rooms: [rectangleRoom('room:r'), rectangleRoom('room:s', 5000)],
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

describe('drawPlan selection overlays', () => {
  const viewport = { scale: DEFAULT_PLAN_SCALE, offset: { x: 0, y: 0 } }

  it('strokes a highlight around a selected room and leaves an unselected room fill-only', () => {
    const room = rectangleRoom('room:r')
    const base = { walls: [], rooms: [room], viewport, width: 800, height: 600 } as const

    const unselected = recordingContext()
    drawPlan(unselected.ctx, { ...base, selectedIds: new Set<string>() })

    const selected = recordingContext()
    drawPlan(selected.ctx, { ...base, selectedIds: new Set(['room:r']) })

    expect(unselected.ops).not.toContain('stroke')
    expect(selected.ops).toContain('stroke')
    expect(selected.segments.length).toBeGreaterThan(0)
  })

  it('paints the marquee when the option is set and omits it otherwise', () => {
    const marquee: Bounds = { min: { x: 1000, y: 1000 }, max: { x: 5000, y: 5000 } }
    const base = { walls: [wall], viewport, width: 800, height: 600 } as const

    const without = recordingContext()
    drawPlan(without.ctx, { ...base, selectedIds: new Set<string>() })

    const withMarquee = recordingContext()
    drawPlan(withMarquee.ctx, { ...base, selectedIds: new Set<string>(), marquee })

    const min = worldToScreen(marquee.min, viewport)
    const max = worldToScreen(marquee.max, viewport)
    expect(without.fillRects).toHaveLength(0)
    expect(withMarquee.fillRects).toContainEqual({
      x: min.x,
      y: min.y,
      w: max.x - min.x,
      h: max.y - min.y,
    })
  })
})

describe('drawPlan grid and rulers', () => {
  const room = rectangleRoom('room:r')

  it('paints grid beneath rooms and rulers above walls when enabled', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, {
      walls: [wall],
      rooms: [room],
      viewport: { scale: DEFAULT_PLAN_SCALE, offset: { x: 0, y: 0 } },
      width: 200,
      height: 200,
      selectedIds: new Set<string>(),
      grid: true,
      rulers: true,
    })

    const { ops } = recorder
    expect(ops.indexOf('stroke')).toBeLessThan(ops.indexOf('fill'))
    expect(ops).toContain('fillRect')
    expect(ops.indexOf('fillText')).toBeGreaterThan(ops.lastIndexOf('fill'))
  })

  it('omits grid and rulers when the flags are absent', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, {
      walls: [wall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set<string>(),
    })

    expect(recorder.ops).not.toContain('fillText')
    expect(recorder.ops).not.toContain('fillRect')
    expect(recorder.segments).toHaveLength(1)
  })
})

describe('drawMarquee', () => {
  it('fills a rectangle covering the marquee projected to screen space', () => {
    const recorder = recordingContext()
    const viewport = { scale: DEFAULT_PLAN_SCALE, offset: { x: 10, y: 20 } }
    const rect: Bounds = { min: { x: 1000, y: 2000 }, max: { x: 5000, y: 6000 } }

    drawMarquee(recorder.ctx, rect, viewport)

    const min = worldToScreen(rect.min, viewport)
    const max = worldToScreen(rect.max, viewport)
    expect(recorder.fillRects).toContainEqual({
      x: min.x,
      y: min.y,
      w: max.x - min.x,
      h: max.y - min.y,
    })
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
    // the origin label (world 0 mm) appears as text when it is in view at offset 0
    expect(recorder.texts.map((entry) => entry.text)).toContain('0')
  })
})
