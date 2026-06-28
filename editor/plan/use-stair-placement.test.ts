import { afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { ADD_STAIR, createFloor, type AddStairParams, type Command, type Floor } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
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

function placeStair(tool: ToolId, floors: readonly Floor[], activeFloorId: string | null) {
  const dispatch = vi.fn()
  const session = sessionWithFloors(floors, dispatch)
  const { result } = renderHook(() =>
    useStairPlacement({ session, tool, viewport: VIEWPORT, activeFloorId }),
  )
  result.current.onPointerDown(clickAt(CLICK_X, CLICK_Y))
  return dispatch
}

function paramsOf(command: Command): AddStairParams {
  return command.params as AddStairParams
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
})
