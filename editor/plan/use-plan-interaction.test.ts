import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook, type RenderHookResult } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { createEditorSession } from '../../bridge'
import { addFloor, addWall, createEmptyProject } from '../../core'
import { usePlanInteraction, type PlanInteraction } from './use-plan-interaction'

afterEach(cleanup)

const VIEWPORT = { scale: 1 }

interface ScreenPoint {
  x: number
  y: number
}

interface Editor {
  session: ReturnType<typeof createEditorSession>
  floorId: string
}

function buildEditor(): Editor {
  const session = createEditorSession(
    createEmptyProject({ name: 'Test', units: 'metric', period: 'modern', appVersion: '0.0.0' }),
  )
  session.dispatch(addFloor('Ground'))
  return { session, floorId: session.getProject().floors[0]!.id }
}

function buildCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
  return canvas
}

type Interaction = RenderHookResult<PlanInteraction, unknown>

function mountWallTool({ session, floorId }: Editor): Interaction {
  return renderHook(() =>
    usePlanInteraction({
      session,
      walls: [],
      tool: 'draw-wall',
      viewport: VIEWPORT,
      activeFloorId: floorId,
    }),
  )
}

// One corner dropped on the canvas. The first drops the anchor and commits
// nothing; each later one commits the segment back to the previous corner.
function dropCorner(interaction: Interaction, canvas: HTMLCanvasElement, at: ScreenPoint): void {
  act(() => {
    interaction.result.current.onPointerDown({
      clientX: at.x,
      clientY: at.y,
      currentTarget: canvas,
    } as unknown as PointerEvent<HTMLCanvasElement>)
  })
}

function pressBackspace(target: EventTarget = window): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
  })
}

// A run of one committed segment, drawn from two dropped corners. The open run is
// returned so a caller can keep drawing on it.
function drawOneSegment(editor: Editor): { interaction: Interaction; canvas: HTMLCanvasElement } {
  const canvas = buildCanvas()
  const interaction = mountWallTool(editor)
  dropCorner(interaction, canvas, { x: 100, y: 100 })
  dropCorner(interaction, canvas, { x: 400, y: 100 })
  return { interaction, canvas }
}

function wallsOf(editor: Editor) {
  return editor.session.getProject().floors[0]!.walls
}

describe('the wall tool Backspace', () => {
  it('steps back the segment the run just committed', () => {
    const editor = buildEditor()
    drawOneSegment(editor)
    expect(editor.session.getSceneGraph().walls).toHaveLength(1)

    pressBackspace()

    expect(editor.session.getSceneGraph().walls).toHaveLength(0)
  })

  it('leaves a Backspace typed into an inspector field to that field', () => {
    const editor = buildEditor()
    drawOneSegment(editor)

    const field = document.createElement('input')
    document.body.appendChild(field)
    field.focus()
    pressBackspace(field)
    field.remove()

    expect(editor.session.getSceneGraph().walls).toHaveLength(1)
  })

  it('leaves history alone when the run no longer owns the newest change', () => {
    const editor = buildEditor()
    drawOneSegment(editor)
    editor.session.dispatch(addWall(editor.floorId, { x: 9000, y: 0 }, { x: 9000, y: 500 }))
    expect(editor.session.getSceneGraph().walls).toHaveLength(2)

    pressBackspace()

    expect(editor.session.getSceneGraph().walls).toHaveLength(2)
  })

  it('keeps drawing from the real last corner after a Backspace it could not honour', () => {
    const editor = buildEditor()
    const { interaction, canvas } = drawOneSegment(editor)
    editor.session.dispatch(addWall(editor.floorId, { x: 9000, y: 0 }, { x: 9000, y: 500 }))

    pressBackspace()
    dropCorner(interaction, canvas, { x: 400, y: 400 })

    // The corner the run is drawing from is still the one it actually committed,
    // so the next segment continues the run rather than forking off the anchor.
    const drawn = wallsOf(editor).at(-1)!
    expect(drawn.start).toEqual({ x: 400, y: -100 })
  })

  it('steps back each segment of a longer run on consecutive presses', () => {
    const editor = buildEditor()
    const { interaction, canvas } = drawOneSegment(editor)
    dropCorner(interaction, canvas, { x: 400, y: 400 })
    expect(editor.session.getSceneGraph().walls).toHaveLength(2)

    pressBackspace()
    expect(editor.session.getSceneGraph().walls).toHaveLength(1)

    pressBackspace()
    expect(editor.session.getSceneGraph().walls).toHaveLength(0)
  })
})
