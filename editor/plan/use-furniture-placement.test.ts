import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'
import { FURNITURE_NODE_PREFIX, type Command, type PlaceFurnitureParams } from '../../core'
import { createSelectionStore } from '../../bridge'
import type { EditorSession, SelectionStore } from '../../bridge'
import type { LibraryItem } from '../../storage'
import type { ToolId } from '../tools/active-tool-context'
import { usePlaceFurniture } from './use-furniture-placement'
import type { Viewport } from './viewport'

afterEach(cleanup)

const VIEWPORT: Viewport = { scale: 1, offset: { x: 0, y: 0 } }
const FLOOR_ID = 'g'
const NO_ROTATION_DEGREES = 0
const FIRST_CLICK_X = 100
const FIRST_CLICK_Y = 100
const SECOND_CLICK_X = 300
const SECOND_CLICK_Y = 300
const CHAIR_FOOTPRINT_MM = { width: 600, depth: 600 }
const CHAIR_HEIGHT_MM = 750

const chair: LibraryItem = {
  reference: { scope: 'user', contentHash: 'hash-1' },
  name: 'Chair',
  kind: 'furniture',
  categories: [],
  eras: [],
  footprint: CHAIR_FOOTPRINT_MM,
  height: CHAIR_HEIGHT_MM,
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
    ReturnType<typeof usePlaceFurniture>['onPointerDown']
  >[0]
}

function renderPlacement(
  dispatch: ReturnType<typeof vi.fn>,
  selection: SelectionStore,
  tool: ToolId = 'place-furniture',
) {
  const session = { dispatch } as unknown as EditorSession
  return renderHook(() =>
    usePlaceFurniture({
      session,
      tool,
      viewport: VIEWPORT,
      activeFloorId: FLOOR_ID,
      armed: chair,
      rotation: NO_ROTATION_DEGREES,
      selection,
    }),
  )
}

function placedFurnitureId(dispatch: ReturnType<typeof vi.fn>, call: number): string {
  const [command] = dispatch.mock.calls[call] as [Command<PlaceFurnitureParams>]
  return command.params.furniture.id
}

describe('usePlaceFurniture', () => {
  it('selects the piece it just placed', () => {
    const dispatch = vi.fn()
    const selection = createSelectionStore()
    const { result } = renderPlacement(dispatch, selection)

    act(() => {
      result.current.onPointerDown(clickAt(FIRST_CLICK_X, FIRST_CLICK_Y))
    })

    expect(selection.getSelectedIds()).toEqual(
      new Set([`${FURNITURE_NODE_PREFIX}${placedFurnitureId(dispatch, 0)}`]),
    )
  })

  it('moves the selection to the second piece placed, dropping the first', () => {
    const dispatch = vi.fn()
    const selection = createSelectionStore()
    const { result } = renderPlacement(dispatch, selection)

    act(() => {
      result.current.onPointerDown(clickAt(FIRST_CLICK_X, FIRST_CLICK_Y))
    })
    act(() => {
      result.current.onPointerDown(clickAt(SECOND_CLICK_X, SECOND_CLICK_Y))
    })

    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(selection.getSelectedIds()).toEqual(
      new Set([`${FURNITURE_NODE_PREFIX}${placedFurnitureId(dispatch, 1)}`]),
    )
  })

  it('dispatches nothing and leaves the selection empty under another tool', () => {
    const dispatch = vi.fn()
    const selection = createSelectionStore()
    const { result } = renderPlacement(dispatch, selection, 'select')

    act(() => {
      result.current.onPointerDown(clickAt(FIRST_CLICK_X, FIRST_CLICK_Y))
    })

    expect(dispatch).not.toHaveBeenCalled()
    expect(selection.getSelectedIds()).toEqual(new Set())
  })
})
