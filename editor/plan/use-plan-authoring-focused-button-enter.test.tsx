import { useState } from 'react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { createEmptyProject, createFloor, createWall } from '../../core'
import type { Project } from '../../core'
import { createSelectionStore } from '../../bridge'
import type { EditorSession } from '../../bridge'
import { createEditorSession } from '../../session/testing'
import type { ToolId } from '../tools/active-tool-context'
import { OpeningToolProvider } from './opening-tool-context'
import { usePlanAuthoring } from './use-plan-authoring'

afterEach(cleanup)

const FLOOR_ID = 'g'
const DOOR_TYPE = 'single-swing-door'
const WALL_HALF_LENGTH_MM = 500
const ENTER = 'Enter'
const ESCAPE = 'Escape'
const VERTEX_DROPPED = 'Wall vertex dropped'

function projectWithOneWall(): Project {
  const project = createEmptyProject({
    name: 'T',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
  const wall = createWall(
    { x: -WALL_HALF_LENGTH_MM, y: 0 },
    { x: WALL_HALF_LENGTH_MM, y: 0 },
    { id: 'w1' },
  )
  project.floors = [createFloor('G', { id: FLOOR_ID, walls: [wall] })]
  return project
}

interface PlanProps {
  session: EditorSession
  tool: ToolId
}

// The real authoring hook beside the buttons a plan screen carries: a plain
// button, the chip of the armed tool, and the chip of another tool.
function Plan({ session, tool }: PlanProps) {
  const [selection] = useState(createSelectionStore)
  const { announcement } = usePlanAuthoring({
    session,
    selection,
    tool,
    activeFloorId: FLOOR_ID,
    graph: session.getSceneGraph(),
    placementType: DOOR_TYPE,
    rotation: 0,
  })
  return (
    <>
      <button type="button">Furniture</button>
      <div role="radiogroup" aria-label="Tools">
        <button type="button" role="radio" aria-checked="true">
          Armed chip
        </button>
        <button type="button" role="radio" aria-checked="false">
          Other chip
        </button>
      </div>
      <output data-testid="announcement">{announcement}</output>
    </>
  )
}

function renderPlan(tool: ToolId) {
  const session = createEditorSession(projectWithOneWall())
  const dispatch = vi.spyOn(session, 'dispatch')
  render(
    <OpeningToolProvider>
      <Plan session={session} tool={tool} />
    </OpeningToolProvider>,
  )
  return { session, dispatch }
}

// Focuses the button and presses the key on it. Returns true when a handler
// prevented the default of the key press, which would cancel the button's click.
function press(button: HTMLElement, key: string): boolean {
  button.focus()
  return !fireEvent.keyDown(button, { key })
}

function announcement(): string {
  return screen.getByTestId('announcement').textContent ?? ''
}

describe('Enter on a focused button while an authoring tool is armed', () => {
  it('leaves the button to activate and drops no wall vertex under the wall tool', () => {
    const { dispatch } = renderPlan('draw-wall')

    const prevented = press(screen.getByRole('button', { name: 'Furniture' }), ENTER)

    expect(announcement()).not.toContain(VERTEX_DROPPED)
    expect(dispatch).not.toHaveBeenCalled()
    expect(prevented).toBe(false)
  })

  it('leaves the button to activate and places no opening under the opening tool', () => {
    const { session, dispatch } = renderPlan('place-opening')

    const prevented = press(screen.getByRole('button', { name: 'Furniture' }), ENTER)

    expect(session.getProject().floors[0]!.openings).toHaveLength(0)
    expect(dispatch).not.toHaveBeenCalled()
    expect(prevented).toBe(false)
  })

  it('still drops a wall vertex when the armed tool chip holds the focus', () => {
    renderPlan('draw-wall')

    act(() => {
      press(screen.getByRole('radio', { name: 'Armed chip' }), ENTER)
    })

    expect(announcement()).toContain(VERTEX_DROPPED)
  })

  it('leaves the chip of another tool to activate and drops no wall vertex', () => {
    const { dispatch } = renderPlan('draw-wall')

    const prevented = press(screen.getByRole('radio', { name: 'Other chip' }), ENTER)

    expect(announcement()).not.toContain(VERTEX_DROPPED)
    expect(dispatch).not.toHaveBeenCalled()
    expect(prevented).toBe(false)
  })

  it('still cancels an open wall run on Escape pressed on a plain button', () => {
    renderPlan('draw-wall')
    act(() => {
      press(screen.getByRole('radio', { name: 'Armed chip' }), ENTER)
    })
    expect(announcement()).toContain(VERTEX_DROPPED)

    act(() => {
      press(screen.getByRole('button', { name: 'Furniture' }), ESCAPE)
    })

    expect(announcement()).toMatch(/cancel|abandon/i)
  })
})
