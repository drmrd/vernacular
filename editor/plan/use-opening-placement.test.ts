import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'
import { createOpening, type Opening, type SceneGraph, type WallSceneNode } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { OpeningToolProvider, useOpeningTool } from './opening-tool-context'
import { useOpeningPlacement } from './use-opening-placement'
import type { Viewport } from './viewport'

afterEach(cleanup)

const VIEWPORT: Viewport = { scale: 1, offset: { x: 0, y: 0 } }
const FLOOR_ID = 'g'
const WALL_THICKNESS_MM = 114
const WALL_LENGTH_MM = 2000
const DOOR_TYPE = 'single-swing-door'
// The wall runs along y = 0, so a click at y = 0 lands on it and a click 500 mm
// away is well clear of the 150 mm hit tolerance.
const WALL_MIDPOINT_X = 1000
const CLEAR_OF_WALL_Y = 500

function horizontalWall(): WallSceneNode {
  return {
    id: 'wall:w1',
    kind: 'wall',
    floorId: FLOOR_ID,
    start: { x: 0, y: 0 },
    end: { x: WALL_LENGTH_MM, y: 0 },
    thickness: WALL_THICKNESS_MM,
  }
}

function graphWithOneWall(): SceneGraph {
  return {
    nodes: [],
    walls: [horizontalWall()],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

function sessionWithOpenings(
  openings: readonly Opening[],
  dispatch: ReturnType<typeof vi.fn>,
): EditorSession {
  return {
    dispatch,
    getProject: () => ({ floors: [{ id: FLOOR_ID, openings }] }),
    undo: vi.fn(),
  } as unknown as EditorSession
}

// jsdom reports a zero-sized canvas, which would divide eventToCanvas by zero;
// pin the rect to the canvas's own pixel size so a click maps one-to-one.
function canvasAtOrigin(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: canvas.width, height: canvas.height }) as DOMRect
  return canvas
}

function clickAt(x: number, y: number) {
  return { clientX: x, clientY: y, currentTarget: canvasAtOrigin() } as unknown as Parameters<
    ReturnType<typeof useOpeningPlacement>['onPointerDown']
  >[0]
}

interface PlacementRun {
  tool?: ToolId
  openings?: readonly Opening[]
  at: { x: number; y: number }
}

function placeOpeningAt(run: PlacementRun) {
  const dispatch = vi.fn()
  const session = sessionWithOpenings(run.openings ?? [], dispatch)
  const { result } = renderHook(
    () => ({
      placement: useOpeningPlacement({
        session,
        graph: graphWithOneWall(),
        tool: run.tool ?? 'place-opening',
        viewport: VIEWPORT,
        placementType: DOOR_TYPE,
      }),
      opening: useOpeningTool(),
    }),
    { wrapper: OpeningToolProvider },
  )
  act(() => {
    result.current.placement.onPointerDown(clickAt(run.at.x, run.at.y))
  })
  return { dispatch, refusal: () => result.current.opening.placementRefusal }
}

function doorAt(position: number): Opening {
  return createOpening({ id: 'existing', type: DOOR_TYPE, hostWallId: 'w1', position })
}

describe('useOpeningPlacement', () => {
  it('places an opening on the wall under the click', () => {
    const run = placeOpeningAt({ at: { x: WALL_MIDPOINT_X, y: 0 } })

    expect(run.dispatch).toHaveBeenCalledTimes(1)
    expect(run.refusal()).toBeNull()
  })

  it('says a click clear of every wall had nothing to host the opening', () => {
    const run = placeOpeningAt({ at: { x: WALL_MIDPOINT_X, y: CLEAR_OF_WALL_Y } })

    expect(run.dispatch).not.toHaveBeenCalled()
    expect(run.refusal()).toBe('no-host-wall')
  })

  it('distinguishes an overlap with an opening already in the wall from a miss', () => {
    const run = placeOpeningAt({
      openings: [doorAt(WALL_MIDPOINT_X)],
      at: { x: WALL_MIDPOINT_X, y: 0 },
    })

    expect(run.dispatch).not.toHaveBeenCalled()
    expect(run.refusal()).toBe('opening-overlap')
  })

  it('clears an earlier refusal when a later click lands', () => {
    const dispatch = vi.fn()
    const session = sessionWithOpenings([], dispatch)
    const { result } = renderHook(
      () => ({
        placement: useOpeningPlacement({
          session,
          graph: graphWithOneWall(),
          tool: 'place-opening',
          viewport: VIEWPORT,
          placementType: DOOR_TYPE,
        }),
        opening: useOpeningTool(),
      }),
      { wrapper: OpeningToolProvider },
    )

    act(() => {
      result.current.placement.onPointerDown(clickAt(WALL_MIDPOINT_X, CLEAR_OF_WALL_Y))
    })
    expect(result.current.opening.placementRefusal).toBe('no-host-wall')

    act(() => {
      result.current.placement.onPointerDown(clickAt(WALL_MIDPOINT_X, 0))
    })

    expect(result.current.opening.placementRefusal).toBeNull()
  })

  it('refuses nothing under another tool', () => {
    const run = placeOpeningAt({ tool: 'select', at: { x: WALL_MIDPOINT_X, y: CLEAR_OF_WALL_Y } })

    expect(run.dispatch).not.toHaveBeenCalled()
    expect(run.refusal()).toBeNull()
  })
})
