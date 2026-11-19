import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { createEditorSession } from '../../session/testing'
import { addFloor, createEmptyProject } from '../../core'
import type { ToolId } from '../tools/active-tool-context'
import { usePlanInteraction } from './use-plan-interaction'

afterEach(cleanup)

const VIEWPORT = { scale: 1 }
const WALL_TOOL: ToolId = 'draw-wall'
const SELECT_TOOL: ToolId = 'select'
const BACKSPACE = 'Backspace'
const CANVAS_WIDTH_PX = 800
const CANVAS_HEIGHT_PX = 600
const FIRST_CORNER = { x: 100, y: 100 }
const SECOND_CORNER = { x: 400, y: 100 }
const NEW_RUN_CORNER = { x: 400, y: 400 }
const HOVER_POINT = { x: 500, y: 400 }
const LATER_CORNER = { x: 100, y: 400 }
const ONE_WALL = 1

interface ScreenPoint {
  x: number
  y: number
}

function buildCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH_PX
  canvas.height = CANVAS_HEIGHT_PX
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, CANVAS_WIDTH_PX, CANVAS_HEIGHT_PX)
  return canvas
}

function pointerAt(at: ScreenPoint, canvas: HTMLCanvasElement): PointerEvent<HTMLCanvasElement> {
  return {
    clientX: at.x,
    clientY: at.y,
    currentTarget: canvas,
  } as unknown as PointerEvent<HTMLCanvasElement>
}

// The real wall tool hook on a real session, with a run of one committed wall
// drawn from two corners dropped on the canvas.
function openPointerWallRun() {
  const session = createEditorSession(
    createEmptyProject({ name: 'Test', units: 'metric', period: 'modern', appVersion: '0.0.0' }),
  )
  session.dispatch(addFloor('Ground'))
  const activeFloorId = session.getProject().floors[0]!.id
  const interaction = renderHook(
    ({ tool }: { tool: ToolId }) =>
      usePlanInteraction({ session, walls: [], tool, viewport: VIEWPORT, activeFloorId }),
    { initialProps: { tool: WALL_TOOL } },
  )
  const canvas = buildCanvas()
  const dropCorner = (at: ScreenPoint): void => {
    act(() => interaction.result.current.onPointerDown(pointerAt(at, canvas)))
  }
  const moveTo = (at: ScreenPoint): void => {
    act(() => interaction.result.current.onPointerMove(pointerAt(at, canvas)))
  }
  dropCorner(FIRST_CORNER)
  dropCorner(SECOND_CORNER)
  const changeToolAndBack = (): void => {
    interaction.rerender({ tool: SELECT_TOOL })
    interaction.rerender({ tool: WALL_TOOL })
  }
  const wallCount = (): number => session.getSceneGraph().walls.length
  return {
    current: () => interaction.result.current,
    dropCorner,
    moveTo,
    changeToolAndBack,
    wallCount,
  }
}

describe('usePlanInteraction when the active tool changes', () => {
  it('starts a new run on the first click after the Wall tool comes back', () => {
    const run = openPointerWallRun()
    expect(run.wallCount()).toBe(ONE_WALL)

    run.changeToolAndBack()
    run.dropCorner(NEW_RUN_CORNER)

    expect(run.wallCount()).toBe(ONE_WALL)
  })

  it('leaves the walls of a discarded run to undo, out of reach of Backspace', () => {
    const run = openPointerWallRun()

    run.changeToolAndBack()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: BACKSPACE }))
    })

    expect(run.wallCount()).toBe(ONE_WALL)
  })

  it('shows no rubber band and no snap indicator from a discarded run', () => {
    const run = openPointerWallRun()
    run.moveTo(HOVER_POINT)

    run.changeToolAndBack()

    expect(run.current().snap).toBeNull()
    expect(run.current().preview).toBeUndefined()

    run.dropCorner(LATER_CORNER)

    expect(run.current().preview).toBeUndefined()
  })
})
