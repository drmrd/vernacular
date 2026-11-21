import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { createEditorSession } from '../../session/testing'
import { addFloor, createEmptyProject } from '../../core'
import { usePlanInteraction } from './use-plan-interaction'

afterEach(cleanup)

const VIEWPORT = { scale: 1 }
const ENTER = 'Enter'
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

// The real wall tool hook with a run of one committed wall, drawn from two
// pointer corners dropped on a canvas that sits in the document, beside the
// buttons a plan screen carries: a plain button and the chip of the armed tool.
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
  render(
    <>
      <button type="button">Furniture</button>
      <div role="radiogroup" aria-label="Tools">
        <button type="button" role="radio" aria-checked="true">
          Wall
        </button>
      </div>
    </>,
  )
  const canvas = buildCanvas()
  document.body.appendChild(canvas)
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
  return { canvas, dropCorner, wallCount }
}

function pressEnterOn(target: HTMLElement): void {
  target.focus()
  act(() => {
    fireEvent.keyDown(target, { key: ENTER })
  })
}

describe('Enter on a focused element while a pointer wall run is open', () => {
  it('leaves the run open when an ordinary button holds the focus', () => {
    const run = openPointerWallRun()
    expect(run.wallCount()).toBe(1)

    pressEnterOn(screen.getByRole('button', { name: 'Furniture' }))
    run.dropCorner(THIRD_CORNER)

    // The button owned the Enter, so this corner chains a second wall.
    expect(run.wallCount()).toBe(2)
  })

  it('ends the run when the chip of the armed tool holds the focus', () => {
    const run = openPointerWallRun()

    pressEnterOn(screen.getByRole('radio', { name: 'Wall' }))
    run.dropCorner(THIRD_CORNER)

    // The run ended, so this corner only starts a new run and commits no wall.
    expect(run.wallCount()).toBe(1)
  })

  it('ends the run when the plan itself holds the focus', () => {
    const run = openPointerWallRun()

    pressEnterOn(run.canvas)
    run.dropCorner(THIRD_CORNER)

    expect(run.wallCount()).toBe(1)
  })
})
