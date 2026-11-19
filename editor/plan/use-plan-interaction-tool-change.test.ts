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
const TWO_WALLS = 2
const FIRST_FLOOR_INDEX = 0
const SECOND_FLOOR_INDEX = 1

interface HookProps {
  tool: ToolId
  activeFloorId: string
}

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

// The real wall tool hook on a real session with a Ground floor and an Upper
// floor, with a run of one committed wall drawn on Ground from two corners
// dropped on the canvas.
function openPointerWallRun() {
  const session = createEditorSession(
    createEmptyProject({ name: 'Test', units: 'metric', period: 'modern', appVersion: '0.0.0' }),
  )
  session.dispatch(addFloor('Ground'))
  session.dispatch(addFloor('Upper'))
  const { floors } = session.getProject()
  const groundId = floors[FIRST_FLOOR_INDEX]!.id
  const upperId = floors[SECOND_FLOOR_INDEX]!.id
  const interaction = renderHook(
    ({ tool, activeFloorId }: HookProps) =>
      usePlanInteraction({ session, walls: [], tool, viewport: VIEWPORT, activeFloorId }),
    { initialProps: { tool: WALL_TOOL, activeFloorId: groundId } },
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
    interaction.rerender({ tool: SELECT_TOOL, activeFloorId: groundId })
    interaction.rerender({ tool: WALL_TOOL, activeFloorId: groundId })
  }
  const rerenderOnFloor = (activeFloorId: string): void => {
    interaction.rerender({ tool: WALL_TOOL, activeFloorId })
  }
  const wallCount = (): number =>
    session.getProject().floors.reduce((total, floor) => total + floor.walls.length, 0)
  const wallCountOnGround = (): number =>
    session.getProject().floors.find((floor) => floor.id === groundId)!.walls.length
  return {
    current: () => interaction.result.current,
    dropCorner,
    moveTo,
    changeToolAndBack,
    rerenderOnFloor,
    groundId,
    upperId,
    wallCount,
    wallCountOnGround,
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

describe('usePlanInteraction when the active floor changes', () => {
  it('starts a new run on the first click after the active floor changes', () => {
    const run = openPointerWallRun()
    expect(run.wallCount()).toBe(ONE_WALL)

    run.rerenderOnFloor(run.upperId)
    run.dropCorner(NEW_RUN_CORNER)

    expect(run.wallCount()).toBe(ONE_WALL)
  })

  it('starts a new run after the active floor changes and comes back', () => {
    const run = openPointerWallRun()

    run.rerenderOnFloor(run.upperId)
    run.rerenderOnFloor(run.groundId)
    run.dropCorner(NEW_RUN_CORNER)

    expect(run.wallCount()).toBe(ONE_WALL)
  })

  it('keeps the run open across a re-render with the same tool and floor', () => {
    const run = openPointerWallRun()

    run.rerenderOnFloor(run.groundId)
    run.dropCorner(NEW_RUN_CORNER)

    expect(run.wallCountOnGround()).toBe(TWO_WALLS)
  })
})
