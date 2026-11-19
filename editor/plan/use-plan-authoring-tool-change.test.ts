import { afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { ADD_DIMENSION, ADD_WALL } from '../../core'
import { createSelectionStore } from '../../bridge'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { usePlanAuthoring } from './use-plan-authoring'

afterEach(cleanup)

const FLOOR_ID = 'g'
const WALL_TOOL: ToolId = 'draw-wall'
const DIMENSION_TOOL: ToolId = 'dimension'
const SELECT_TOOL: ToolId = 'select'
const SINGLE_DISPATCH = 1
const NO_DISPATCH = 0

function pressKey(key: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function fakeSession(dispatch: ReturnType<typeof vi.fn>): EditorSession {
  return {
    dispatch,
    getProject: () => ({ floors: [{ id: FLOOR_ID }] }),
    undo: vi.fn(),
  } as unknown as EditorSession
}

function renderAuthoring(dispatch: ReturnType<typeof vi.fn>, tool: ToolId) {
  const session = fakeSession(dispatch)
  const selection = createSelectionStore()
  return renderHook(
    ({ tool: activeTool }: { tool: ToolId }) =>
      usePlanAuthoring({ session, selection, tool: activeTool, activeFloorId: FLOOR_ID }),
    { initialProps: { tool } },
  )
}

function dispatchedTypes(dispatch: ReturnType<typeof vi.fn>): string[] {
  return dispatch.mock.calls.map(([command]) => (command as { type: string }).type)
}

describe('usePlanAuthoring when the active tool changes', () => {
  it('leaves no keyboard wall run open after the tool changes and comes back', () => {
    const dispatch = vi.fn()
    const { rerender } = renderAuthoring(dispatch, WALL_TOOL)

    // Anchor a run, nudge one grid step, and commit its first wall.
    pressKey('Enter')
    pressKey('ArrowRight')
    pressKey('Enter')
    expect(dispatchedTypes(dispatch).filter((type) => type === ADD_WALL)).toHaveLength(
      SINGLE_DISPATCH,
    )

    rerender({ tool: SELECT_TOOL })
    rerender({ tool: WALL_TOOL })

    // The first Enter after re-arming would anchor a new run, so this pair of
    // keys must not extend the run that the tool change should have discarded.
    pressKey('ArrowRight')
    pressKey('Enter')

    expect(dispatchedTypes(dispatch).filter((type) => type === ADD_WALL)).toHaveLength(
      SINGLE_DISPATCH,
    )
  })

  it('leaves no keyboard measurement open after the tool changes and comes back', () => {
    const dispatch = vi.fn()
    const { result, rerender } = renderAuthoring(dispatch, DIMENSION_TOOL)

    // Drop the measurement start.
    pressKey('Enter')

    rerender({ tool: SELECT_TOOL })
    rerender({ tool: DIMENSION_TOOL })

    // Without a start left over, the Enter after the nudge only anchors a new
    // measurement, so nothing is recorded.
    pressKey('ArrowRight')
    pressKey('Enter')

    expect(dispatchedTypes(dispatch).filter((type) => type === ADD_DIMENSION)).toHaveLength(
      NO_DISPATCH,
    )
    expect(result.current.announcement).not.toMatch(/Dimension measured/)
  })
})
