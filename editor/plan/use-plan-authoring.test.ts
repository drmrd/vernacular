import { afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { ADD_WALL } from '../../core'
import type { EditorSession } from '../../bridge'
import { usePlanAuthoring } from './use-plan-authoring'

afterEach(cleanup)

function dispatchWindowKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

function fakeSession(dispatch: ReturnType<typeof vi.fn>): EditorSession {
  return {
    dispatch,
    getProject: () => ({ floors: [{ id: 'g' }] }),
    undo: vi.fn(),
  } as unknown as EditorSession
}

describe('usePlanAuthoring', () => {
  it('drops a wall vertex on Enter and moves the candidate with arrow keys', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    renderHook(() => usePlanAuthoring({ session, tool: 'draw-wall', activeFloorId: 'g' }))

    // First Enter anchors the run at the seeded origin; advanceWallTool from idle
    // commits no wall yet.
    act(() => dispatchWindowKey('Enter'))
    expect(dispatch).not.toHaveBeenCalled()

    // Nudge the candidate one grid step along +x, then commit the wall.
    act(() => dispatchWindowKey('ArrowRight'))
    act(() => dispatchWindowKey('Enter'))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const cmd = dispatch.mock.calls[0][0]
    expect(cmd.type).toBe(ADD_WALL)
    expect(cmd.params.wall.start).toEqual({ x: 0, y: 0 })
    expect(cmd.params.wall.end).toEqual({ x: 100, y: 0 })
  })

  it('announces the dropped vertex', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    const { result } = renderHook(() =>
      usePlanAuthoring({ session, tool: 'draw-wall', activeFloorId: 'g' }),
    )

    act(() => dispatchWindowKey('Enter'))
    act(() => dispatchWindowKey('ArrowRight'))
    act(() => dispatchWindowKey('Enter'))

    expect(result.current.announcement).toMatch(/vertex|wall/i)
  })

  it('ignores Enter while a non-creative tool is active', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    renderHook(() => usePlanAuthoring({ session, tool: 'select', activeFloorId: 'g' }))

    act(() => dispatchWindowKey('Enter'))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ignores Enter while a form control is focused', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    renderHook(() => usePlanAuthoring({ session, tool: 'draw-wall', activeFloorId: 'g' }))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    input.remove()

    expect(dispatch).not.toHaveBeenCalled()
  })
})
