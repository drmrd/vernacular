import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook, type RenderHookResult } from '@testing-library/react'
import type { PointerEvent } from 'react'

import { createSelectionStore } from '../../bridge'
import type {
  DimensionSceneNode,
  FurnitureInstance,
  RoomSceneNode,
  SceneGraph,
  WallSceneNode,
} from '../../core'

import { usePlanSelection, type PlanSelection } from './use-plan-selection'
import type { Viewport } from './viewport'

afterEach(cleanup)

function room(id: string, polygon: { x: number; y: number }[]): RoomSceneNode {
  return { id, kind: 'room', floorId: 'g', polygon, area: 0, clearPolygon: polygon }
}

function dimension(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): DimensionSceneNode {
  return { id, kind: 'dimension', floorId: 'g', start, end, offset: 0, length: 0 }
}

const WALL_THICKNESS_MM = 114

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): WallSceneNode {
  return { id, kind: 'wall', floorId: 'g', start, end, thickness: WALL_THICKNESS_MM }
}

// A room spanning x in [0, 4000] and y in [0, 4000], with a dimension line
// crossing straight through its middle at y = 2000, sharing the point (2000, 2000).
function graphWithDimensionOverRoom(): SceneGraph {
  return {
    nodes: [],
    walls: [],
    rooms: [
      room('room:a', [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 4000 },
        { x: 0, y: 4000 },
      ]),
    ],
    underlays: [],
    openings: [],
    dimensions: [dimension('dimension:d1', { x: 0, y: 2000 }, { x: 4000, y: 2000 })],
    stairs: [],
    furniture: [],
  }
}

// A wall and a dimension both fully inside the rectangle the marquee drag below sweeps out.
function graphWithWallAndDimension(): SceneGraph {
  return {
    nodes: [],
    walls: [wall('wall:a', { x: 100, y: 100 }, { x: 900, y: 900 })],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [dimension('dimension:d1', { x: 100, y: 500 }, { x: 900, y: 500 })],
    stairs: [],
    furniture: [],
  }
}

const NO_FURNITURE: readonly FurnitureInstance[] = []

// scale 1 with a y offset of 4000 puts the shared world point (2000, 2000) at
// screen point (2000, 2000), so the fixture below reads as one coordinate pair.
const VIEWPORT: Viewport = { scale: 1, offset: { x: 0, y: 4000 } }

function buildCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 5000
  canvas.height = 5000
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 5000, 5000)
  // jsdom has no pointer-capture implementation; the hook calls these unconditionally.
  canvas.setPointerCapture = () => {}
  canvas.releasePointerCapture = () => {}
  canvas.hasPointerCapture = () => true
  return canvas
}

type Selection = RenderHookResult<PlanSelection, unknown>

// A primary-button press and release at the same screen point, with no drag
// between them, which the gesture underneath resolves as a click.
function clickAt(plan: Selection, canvas: HTMLCanvasElement, at: { x: number; y: number }): void {
  const event = {
    clientX: at.x,
    clientY: at.y,
    currentTarget: canvas,
    button: 0,
  } as unknown as PointerEvent<HTMLCanvasElement>
  act(() => {
    plan.result.current.onPointerDown(event)
  })
  act(() => {
    plan.result.current.onPointerUp(event)
  })
}

// A Shift-started marquee drag: press, then move past the drag threshold with
// shift held (locking the gesture into a marquee rather than a pan), then release.
function dragMarquee(
  plan: Selection,
  canvas: HTMLCanvasElement,
  sweep: { from: { x: number; y: number }; to: { x: number; y: number } },
): void {
  const base = { currentTarget: canvas, button: 0, shiftKey: true, pointerId: 1 }
  const down = {
    ...base,
    clientX: sweep.from.x,
    clientY: sweep.from.y,
  } as unknown as PointerEvent<HTMLCanvasElement>
  const move = {
    ...base,
    clientX: sweep.to.x,
    clientY: sweep.to.y,
  } as unknown as PointerEvent<HTMLCanvasElement>
  const up = {
    ...base,
    clientX: sweep.to.x,
    clientY: sweep.to.y,
  } as unknown as PointerEvent<HTMLCanvasElement>
  act(() => {
    plan.result.current.onPointerDown(down)
  })
  act(() => {
    plan.result.current.onPointerMove(move)
  })
  act(() => {
    plan.result.current.onPointerUp(up)
  })
}

describe('usePlanSelection', () => {
  it('selects the room beneath a dimension when the dimensions overlay is hidden', () => {
    const graph = graphWithDimensionOverRoom()
    const selection = createSelectionStore()
    const canvas = buildCanvas()

    const plan = renderHook(() =>
      usePlanSelection({
        graph,
        furniture: NO_FURNITURE,
        selection,
        tool: 'select',
        viewport: VIEWPORT,
        setViewport: () => {},
        dimensionsVisible: false,
      }),
    )

    clickAt(plan, canvas, { x: 2000, y: 2000 })

    expect(selection.getSelectedIds()).toEqual(new Set(['room:a']))
  })

  it('excludes a dimension from a marquee selection when the dimensions overlay is hidden', () => {
    const graph = graphWithWallAndDimension()
    const selection = createSelectionStore()
    const canvas = buildCanvas()

    const plan = renderHook(() =>
      usePlanSelection({
        graph,
        furniture: NO_FURNITURE,
        selection,
        tool: 'select',
        viewport: VIEWPORT,
        setViewport: () => {},
        dimensionsVisible: false,
      }),
    )

    // Screen (0, 4000) and (1000, 3000) map to world (0, 0) and (1000, 1000) under
    // VIEWPORT, a left-to-right drag windowing over both the wall and the dimension.
    dragMarquee(plan, canvas, { from: { x: 0, y: 4000 }, to: { x: 1000, y: 3000 } })

    expect(selection.getSelectedIds()).toEqual(new Set(['wall:a']))
  })
})
