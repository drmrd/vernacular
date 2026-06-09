import type { RoomSceneNode, WallSceneNode } from '../../core'
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
  images: { dx: number; dy: number; dWidth: number; dHeight: number; alpha: number }[]
  ops: string[]
  clears: number
  pen: [number, number]
}

function emptyState(): RecorderState {
  return {
    segments: [],
    arcs: [],
    texts: [],
    fillRects: [],
    images: [],
    ops: [],
    clears: 0,
    pen: [0, 0],
  }
}

// eslint-disable-next-line max-lines-per-function -- one recorder method per PlanDrawingContext seam member; the list grows with the seam
function recordingCtx(state: RecorderState): PlanDrawingContext {
  const ctx: PlanDrawingContext = {
    lineWidth: 0,
    lineCap: 'butt',
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
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
    // eslint-disable-next-line max-params -- mirrors the five-argument CanvasRenderingContext2D.drawImage signature, recording the four destination parameters
    drawImage: (_image, dx, dy, dWidth, dHeight) => {
      state.ops.push('drawImage')
      state.images.push({ dx, dy, dWidth, dHeight, alpha: ctx.globalAlpha })
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
    images: state.images,
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

const ROOM_WIDTH_MM = 4000
const ROOM_DEPTH_MM = 3000

/** A 4000 by 3000 mm rectangular room, offset along x so several can sit side by side. */
export function rectangleRoom(id: string, originX = 0): RoomSceneNode {
  const polygon = [
    { x: originX, y: 0 },
    { x: originX + ROOM_WIDTH_MM, y: 0 },
    { x: originX + ROOM_WIDTH_MM, y: ROOM_DEPTH_MM },
    { x: originX, y: ROOM_DEPTH_MM },
  ]
  return {
    id,
    kind: 'room',
    floorId: 'f',
    polygon,
    clearPolygon: polygon,
    area: ROOM_WIDTH_MM * ROOM_DEPTH_MM,
  }
}
