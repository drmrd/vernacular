import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { createEditorSession } from '../../session/testing'
import { addFloor, createEmptyProject } from '../../core'
import { EntityProxy } from './entity-proxy'
import { usePlanInteraction } from './use-plan-interaction'

afterEach(cleanup)

const VIEWPORT = { scale: 1 }
const ENTER = 'Enter'
const PROXY_LABEL = 'Wall, 1000 mm'
const CANVAS_WIDTH_PX = 800
const CANVAS_HEIGHT_PX = 600
const FIRST_CORNER = { x: 100, y: 100 }
const SECOND_CORNER = { x: 400, y: 100 }
const THIRD_CORNER = { x: 400, y: 400 }

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

// The real wall tool hook with a run of one committed wall, drawn from two corners
// dropped on the canvas, and a real focusable proxy of an entity beside it.
function openPointerWallRun() {
  const session = createEditorSession(
    createEmptyProject({ name: 'Test', units: 'metric', period: 'modern', appVersion: '0.0.0' }),
  )
  session.dispatch(addFloor('Ground'))
  const floorId = session.getProject().floors[0]!.id
  const interaction = renderHook(() =>
    usePlanInteraction({
      session,
      walls: [],
      tool: 'draw-wall',
      viewport: VIEWPORT,
      activeFloorId: floorId,
    }),
  )
  const canvas = buildCanvas()
  const dropCorner = (at: ScreenPoint): void => {
    act(() => {
      interaction.result.current.onPointerDown({
        clientX: at.x,
        clientY: at.y,
        currentTarget: canvas,
      } as unknown as PointerEvent<HTMLCanvasElement>)
    })
  }
  dropCorner(FIRST_CORNER)
  dropCorner(SECOND_CORNER)
  const wallCount = (): number => session.getSceneGraph().walls.length
  return { dropCorner, wallCount }
}

function renderProxy(onSelect: () => void): void {
  render(
    <EntityProxy
      entity={{
        id: 'w1',
        kind: 'wall',
        label: PROXY_LABEL,
        anchor: { x: 0, y: 0 },
        selected: false,
      }}
      screen={{ x: 0, y: 0 }}
      tabIndex={0}
      onSelect={onSelect}
    />,
  )
}

// Returns whether the real proxy prevented the default of the key press.
function pressOnFocusedProxy(key: string): boolean {
  const proxy = screen.getByRole('option', { name: PROXY_LABEL })
  proxy.focus()
  return !fireEvent.keyDown(proxy, { key })
}

describe('Enter while a pointer wall run is open', () => {
  it('leaves the run open when an element already handled the Enter', () => {
    const onSelect = vi.fn()
    renderProxy(onSelect)
    const run = openPointerWallRun()
    expect(run.wallCount()).toBe(1)

    const defaultWasPrevented = pressOnFocusedProxy(ENTER)
    expect(defaultWasPrevented).toBe(true)
    expect(onSelect).toHaveBeenCalled()

    // The run went on, so this corner chains a second wall to the first.
    run.dropCorner(THIRD_CORNER)

    expect(run.wallCount()).toBe(2)
  })

  it('still finishes the run on an Enter that no element handled', () => {
    const run = openPointerWallRun()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ENTER }))
    })
    run.dropCorner(THIRD_CORNER)

    // The run ended, so this corner only starts a new run and commits no wall.
    expect(run.wallCount()).toBe(1)
  })
})
