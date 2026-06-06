import type { WallSceneNode } from '../../core'
import type { PlanDrawingContext } from './draw-plan'

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

interface RecorderState {
  segments: DrawnSegment[]
  arcs: DrawnArc[]
  texts: { text: string; x: number; y: number }[]
  fillRects: { x: number; y: number; w: number; h: number }[]
  ops: string[]
  clears: number
  pen: [number, number]
}

function emptyState(): RecorderState {
  return { segments: [], arcs: [], texts: [], fillRects: [], ops: [], clears: 0, pen: [0, 0] }
}

function recordingCtx(state: RecorderState): PlanDrawingContext {
  const ctx: PlanDrawingContext = {
    lineWidth: 0,
    lineCap: 'butt',
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    clearRect: () => {
      state.ops.push('clearRect')
      state.clears += 1
    },
    beginPath: () => state.ops.push('beginPath'),
    moveTo: (x, y) => {
      state.ops.push('moveTo')
      state.pen = [x, y]
    },
    lineTo: (x, y) => {
      state.ops.push('lineTo')
      state.segments.push({ from: state.pen, to: [x, y], style: String(ctx.strokeStyle) })
    },
    closePath: () => state.ops.push('closePath'),
    stroke: () => state.ops.push('stroke'),
    arc: (x, y, radius) => {
      state.ops.push('arc')
      state.arcs.push({ x, y, radius, fillStyle: String(ctx.fillStyle) })
    },
    fill: () => state.ops.push('fill'),
    fillText: (text, x, y) => {
      state.ops.push('fillText')
      state.texts.push({ text, x, y })
    },
    // eslint-disable-next-line max-params -- mirrors the four-argument CanvasRenderingContext2D.fillRect signature the fake records
    fillRect: (x, y, w, h) => {
      state.ops.push('fillRect')
      state.fillRects.push({ x, y, w, h })
    },
  }
  return ctx
}

/**
 * A `PlanDrawingContext` fake that records the draw calls and ordered op names so
 * tests can assert what the pure drawing functions paint and in what order,
 * without a real 2D canvas (jsdom has none).
 */
export function recordingContext() {
  const state = emptyState()
  const ctx = recordingCtx(state)
  return {
    ctx,
    segments: state.segments,
    arcs: state.arcs,
    texts: state.texts,
    fillRects: state.fillRects,
    ops: state.ops,
    clearCount: () => state.clears,
  }
}

export const sampleWall: WallSceneNode = {
  id: 'wall:a',
  kind: 'wall',
  floorId: 'g',
  start: { x: 0, y: 0 },
  end: { x: 1000, y: 0 },
  thickness: 114,
}
