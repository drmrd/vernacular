import { useState } from 'react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { createEmptyProject, createFloor, createWall } from '../../core'
import type { Project } from '../../core'
import { createSelectionStore } from '../../bridge'
import type { EditorSession } from '../../bridge'
import { createEditorSession } from '../../session/testing'
import type { ToolId } from '../tools/active-tool-context'
import { EntityProxy } from './entity-proxy'
import { OpeningToolProvider, useOpeningTool } from './opening-tool-context'
import { usePlanAuthoring, type PlanAuthoringDeps } from './use-plan-authoring'
import { useOverlayKeyboard } from './use-overlay-keyboard'

afterEach(cleanup)

const FLOOR_ID = 'g'
const WALL_ID = 'w1'
const WALL_LABEL = 'Wall, 1000 mm'
const DOOR_TYPE = 'single-swing-door'
// A wall straddling the seeded origin candidate of the keyboard run, so a drop
// under the opening tool lands a door on it.
const WALL_HALF_LENGTH_MM = 500
const ARMED_FOOTPRINT_MM = 600
const ARMED_HEIGHT_MM = 900
const ENTER = 'Enter'
const SPACE = ' '
const ESCAPE = 'Escape'
const NO_REFUSAL = 'none'

// The item type comes from the hook's own options: the editor layer does not
// import the storage layer directly.
type ArmedItem = NonNullable<PlanAuthoringDeps['armed']>

const ARMED_ITEM: ArmedItem = {
  reference: { scope: 'pack:starter@1.0.0', contentHash: 'abc123' },
  name: 'Wingback chair',
  kind: 'furniture',
  categories: ['seating'],
  eras: ['victorian'],
  footprint: { width: ARMED_FOOTPRINT_MM, depth: ARMED_FOOTPRINT_MM },
  height: ARMED_HEIGHT_MM,
}

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
    { id: WALL_ID },
  )
  project.floors = [createFloor('G', { id: FLOOR_ID, walls: [wall] })]
  return project
}

interface PlanProps {
  session: EditorSession
  tool: ToolId
  onSelect: (id: string, additive: boolean) => void
}

// The real authoring hook and the real proxy of the wall in one tree, the way
// the plan mounts them: the hook listens on window, and the proxy sits in the
// listbox whose real key handler prevents the default of Escape.
function Plan({ session, tool, onSelect }: PlanProps) {
  const [selection] = useState(createSelectionStore)
  const { announcement } = usePlanAuthoring({
    session,
    selection,
    tool,
    activeFloorId: FLOOR_ID,
    graph: session.getSceneGraph(),
    placementType: DOOR_TYPE,
    armed: ARMED_ITEM,
    rotation: 0,
  })
  const { placementRefusal } = useOpeningTool()
  const keyboard = useOverlayKeyboard(1, selection)
  return (
    <>
      <div role="listbox" ref={keyboard.containerRef} onKeyDown={keyboard.onKeyDown}>
        <EntityProxy
          entity={{
            id: WALL_ID,
            kind: 'wall',
            label: WALL_LABEL,
            anchor: { x: 0, y: 0 },
            selected: false,
          }}
          screen={{ x: 0, y: 0 }}
          tabIndex={0}
          onSelect={onSelect}
        />
      </div>
      <output data-testid="announcement">{announcement}</output>
      <output data-testid="refusal">{placementRefusal ?? NO_REFUSAL}</output>
    </>
  )
}

function renderPlan(tool: ToolId) {
  const session = createEditorSession(projectWithOneWall())
  const dispatch = vi.spyOn(session, 'dispatch')
  const onSelect = vi.fn()
  render(
    <OpeningToolProvider>
      <Plan session={session} tool={tool} onSelect={onSelect} />
    </OpeningToolProvider>,
  )
  return { session, dispatch, onSelect }
}

// Returns false when a handler prevented the default of the key press.
function pressOnFocusedProxy(key: string): boolean {
  const proxy = screen.getByRole('option', { name: WALL_LABEL })
  proxy.focus()
  return fireEvent.keyDown(proxy, { key })
}

function dispatchWindowKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

function announcement(): string {
  return screen.getByTestId('announcement').textContent ?? ''
}

function refusal(): string {
  return screen.getByTestId('refusal').textContent ?? ''
}

describe('a key press that a plan entity already handled', () => {
  it('selects the entity on Enter and places no opening under the opening tool', () => {
    const { session, dispatch, onSelect } = renderPlan('place-opening')

    pressOnFocusedProxy(ENTER)

    expect(onSelect).toHaveBeenCalledWith(WALL_ID, false)
    expect(session.getProject().floors[0]!.openings).toHaveLength(0)
    expect(dispatch).not.toHaveBeenCalled()
    expect(refusal()).toBe(NO_REFUSAL)
  })

  it('selects the entity on Space and runs no opening tool action', () => {
    const { session, dispatch, onSelect } = renderPlan('place-opening')

    pressOnFocusedProxy(SPACE)

    expect(onSelect).toHaveBeenCalledWith(WALL_ID, false)
    expect(session.getProject().floors[0]!.openings).toHaveLength(0)
    expect(dispatch).not.toHaveBeenCalled()
    expect(refusal()).toBe(NO_REFUSAL)
  })

  it('selects the entity on Enter and drops no wall vertex under the wall tool', () => {
    const { dispatch, onSelect } = renderPlan('draw-wall')

    pressOnFocusedProxy(ENTER)

    expect(onSelect).toHaveBeenCalledWith(WALL_ID, false)
    expect(dispatch).not.toHaveBeenCalled()
    expect(announcement()).toBe('')
  })

  it('selects the entity on Enter and anchors no dimension start under the dimension tool', () => {
    const { dispatch, onSelect } = renderPlan('dimension')

    pressOnFocusedProxy(ENTER)
    expect(onSelect).toHaveBeenCalledWith(WALL_ID, false)

    // Had the proxy's Enter anchored a start, this next unhandled Enter would
    // drop the end point and author a dimension. It only anchors the start.
    act(() => dispatchWindowKey('ArrowUp'))
    act(() => dispatchWindowKey(ENTER))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('selects the entity on Enter and places no furniture under the furniture tool', () => {
    const { session, dispatch, onSelect } = renderPlan('place-furniture')

    pressOnFocusedProxy(ENTER)

    expect(onSelect).toHaveBeenCalledWith(WALL_ID, false)
    expect(session.getProject().floors[0]!.furniture).toHaveLength(0)
    expect(dispatch).not.toHaveBeenCalled()
    expect(announcement()).toBe('')
  })

  it('still lets Enter that no element handled place the opening at the candidate', () => {
    const { session } = renderPlan('place-opening')

    act(() => dispatchWindowKey(ENTER))

    expect(session.getProject().floors[0]!.openings).toHaveLength(1)
  })

  it('still cancels an open keyboard wall run on Escape that the listbox handled', () => {
    const { dispatch } = renderPlan('draw-wall')
    act(() => dispatchWindowKey(ENTER))
    act(() => dispatchWindowKey('ArrowRight'))

    const defaultLeftAlone = pressOnFocusedProxy(ESCAPE)

    // The listbox prevented the default of this Escape, so the tool saw a key
    // that an element had already handled and cancelled the run all the same.
    expect(defaultLeftAlone).toBe(false)
    expect(announcement()).toMatch(/cancel|abandon/i)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('still cancels an open dimension measurement on Escape that the listbox handled', () => {
    const { dispatch } = renderPlan('dimension')
    act(() => dispatchWindowKey(ENTER))
    act(() => dispatchWindowKey('ArrowUp'))

    const defaultLeftAlone = pressOnFocusedProxy(ESCAPE)

    expect(defaultLeftAlone).toBe(false)
    expect(announcement()).toBe('Dimension cancelled')
    expect(dispatch).not.toHaveBeenCalled()
  })
})
