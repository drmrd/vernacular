import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'
import {
  ADD_STAIR,
  createFloor,
  STAIR_NODE_PREFIX,
  type AddStairParams,
  type Command,
  type Floor,
} from '../../core'
import { createSelectionStore } from '../../bridge'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { OpeningToolProvider, useOpeningTool } from './opening-tool-context'
import { useStairPlacement } from './use-stair-placement'
import type { Viewport } from './viewport'

afterEach(cleanup)

const VIEWPORT: Viewport = { scale: 1, offset: { x: 0, y: 0 } }
const CLICK_X = 1000
const CLICK_Y = 2000
const GROUND_ELEVATION_MM = 0
const UPPER_ELEVATION_MM = 2700

function floor(id: string, elevation: number): Floor {
  return createFloor(id, { id, elevation })
}

function sessionWithFloors(
  floors: readonly Floor[],
  dispatch: ReturnType<typeof vi.fn>,
): EditorSession {
  return { dispatch, getProject: () => ({ floors }), undo: vi.fn() } as unknown as EditorSession
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
    ReturnType<typeof useStairPlacement>['onPointerDown']
  >[0]
}

function clickStairTool(tool: ToolId, floors: readonly Floor[], activeFloorId: string | null) {
  const dispatch = vi.fn()
  const session = sessionWithFloors(floors, dispatch)
  const selection = createSelectionStore()
  const { result } = renderHook(
    () => ({
      placement: useStairPlacement({ session, tool, viewport: VIEWPORT, activeFloorId, selection }),
      opening: useOpeningTool(),
    }),
    { wrapper: OpeningToolProvider },
  )
  act(() => {
    result.current.placement.onPointerDown(clickAt(CLICK_X, CLICK_Y))
  })
  return { dispatch, selection, refusal: () => result.current.opening.placementRefusal }
}

function placeStair(tool: ToolId, floors: readonly Floor[], activeFloorId: string | null) {
  return clickStairTool(tool, floors, activeFloorId).dispatch
}

function paramsOf(command: Command): AddStairParams {
  return command.params as AddStairParams
}

function placedStairId(dispatch: ReturnType<typeof vi.fn>): string {
  const command = dispatch.mock.calls[0]?.[0] as Command
  return paramsOf(command).stair.id
}

describe('useStairPlacement', () => {
  it('dispatches an add-stair command on pointer down under the place-stair tool', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM), floor('upper', UPPER_ELEVATION_MM)]

    const dispatch = placeStair('place-stair', floors, 'ground')

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]?.[0] as Command
    expect(command.type).toBe(ADD_STAIR)
    const { stair } = paramsOf(command)
    expect(stair.connection).toEqual({ fromFloorId: 'ground', toFloorId: 'upper' })
    expect(stair.position).toEqual({ x: CLICK_X, y: -CLICK_Y })
  })

  it('ignores the pointer under any other tool', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM), floor('upper', UPPER_ELEVATION_MM)]

    expect(placeStair('select', floors, 'ground')).not.toHaveBeenCalled()
  })

  it('does not place a stair when no floor sits above the active floor', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM), floor('upper', UPPER_ELEVATION_MM)]

    expect(placeStair('place-stair', floors, 'upper')).not.toHaveBeenCalled()
  })

  it('says why the click on the topmost floor placed nothing', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM), floor('upper', UPPER_ELEVATION_MM)]

    expect(clickStairTool('place-stair', floors, 'upper').refusal()).toBe('no-floor-above')
  })

  it('refuses nothing when the stair lands', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM), floor('upper', UPPER_ELEVATION_MM)]

    expect(clickStairTool('place-stair', floors, 'ground').refusal()).toBeNull()
  })

  it('refuses nothing under another tool', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM)]

    expect(clickStairTool('select', floors, 'ground').refusal()).toBeNull()
  })

  it('selects the stair it just placed', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM), floor('upper', UPPER_ELEVATION_MM)]

    const { dispatch, selection } = clickStairTool('place-stair', floors, 'ground')

    expect(selection.getSelectedIds()).toEqual(
      new Set([`${STAIR_NODE_PREFIX}${placedStairId(dispatch)}`]),
    )
  })

  it('leaves the selection empty when the click on the topmost floor placed nothing', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM), floor('upper', UPPER_ELEVATION_MM)]

    const { selection } = clickStairTool('place-stair', floors, 'upper')

    expect(selection.getSelectedIds()).toEqual(new Set())
  })
})
