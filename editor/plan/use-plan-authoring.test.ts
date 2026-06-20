import { afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { ADD_DIMENSION, ADD_WALL, PLACE_OPENING } from '../../core'
import type { SceneGraph, WallSceneNode } from '../../core'
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

// A scene graph carrying only the supplied walls; placeOpeningTarget reads
// nothing else, so the other node lists stay empty.
function graphWithWalls(walls: WallSceneNode[]): SceneGraph {
  return {
    nodes: [],
    walls,
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

function wall(id: string, start: WallSceneNode['start'], end: WallSceneNode['end']): WallSceneNode {
  return { id, kind: 'wall', floorId: 'g', start, end, thickness: 100 }
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
    const cmd = dispatch.mock.calls[0]![0]
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

  it('finishes the run on a second Enter on the same candidate', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    const { result } = renderHook(() =>
      usePlanAuthoring({ session, tool: 'draw-wall', activeFloorId: 'g' }),
    )

    // Anchor, nudge, commit one wall.
    act(() => dispatchWindowKey('Enter'))
    act(() => dispatchWindowKey('ArrowRight'))
    act(() => dispatchWindowKey('Enter'))
    expect(dispatch).toHaveBeenCalledTimes(1)

    // A second Enter on the unchanged candidate ends the run: advanceWallTool
    // returns idle with no command for a same-point click, so no wall lands.
    act(() => dispatchWindowKey('Enter'))

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(result.current.announcement).toMatch(/finish|done|complete|end/i)
  })

  it('cancels the run on Escape', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    const { result } = renderHook(() =>
      usePlanAuthoring({ session, tool: 'draw-wall', activeFloorId: 'g' }),
    )

    // Anchor the run and move the candidate, then abandon with Escape.
    act(() => dispatchWindowKey('Enter'))
    act(() => dispatchWindowKey('ArrowRight'))
    act(() => dispatchWindowKey('Escape'))

    expect(dispatch).not.toHaveBeenCalled()
    expect(result.current.announcement).toMatch(/cancel|abandon/i)
  })

  it('authors a dimension from a start and end Enter with the candidate nudged between', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    const { result } = renderHook(() =>
      usePlanAuthoring({ session, tool: 'dimension', activeFloorId: 'g' }),
    )

    // First Enter drops the dimension start at the seeded origin; advanceDimensionTool
    // from idle yields no command yet.
    act(() => dispatchWindowKey('Enter'))
    expect(dispatch).not.toHaveBeenCalled()

    // Nudge the candidate one grid step along +y, then drop the end point.
    act(() => dispatchWindowKey('ArrowUp'))
    act(() => dispatchWindowKey('Enter'))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const cmd = dispatch.mock.calls[0]![0]
    expect(cmd.type).toBe(ADD_DIMENSION)
    expect(cmd.params.dimension.start).toEqual({ x: 0, y: 0 })
    expect(cmd.params.dimension.end).toEqual({ x: 0, y: 100 })
    expect(result.current.announcement).toMatch(/\b100\b|mm|length|dimension|measure/i)
  })

  it('dispatches nothing for a zero-length dimension', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    renderHook(() => usePlanAuthoring({ session, tool: 'dimension', activeFloorId: 'g' }))

    // Two Enters on the unchanged candidate: advanceDimensionTool idles on a
    // same-point end, so no dimension lands.
    act(() => dispatchWindowKey('Enter'))
    act(() => dispatchWindowKey('Enter'))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('places an opening on the wall under the candidate on Enter', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    // A horizontal wall straddling the seeded origin candidate {0, 0}; the
    // candidate projects onto it within DEFAULT_HIT_TOLERANCE_MM.
    const graph = graphWithWalls([wall('w1', { x: -500, y: 0 }, { x: 500, y: 0 })])
    const { result } = renderHook(() =>
      usePlanAuthoring({
        session,
        tool: 'place-opening',
        activeFloorId: 'g',
        graph,
        placementType: 'single-swing-door',
      }),
    )

    act(() => dispatchWindowKey('Enter'))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const cmd = dispatch.mock.calls[0]![0]
    expect(cmd.type).toBe(PLACE_OPENING)
    expect(cmd.params.opening.type).toBe('single-swing-door')
    expect(cmd.params.opening.hostWallId).toBe('w1')
    expect(result.current.announcement).toMatch(/placed/i)
  })

  it('dispatches nothing when no wall sits under the candidate', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    // A wall far from the seeded origin candidate: every wall misses by more
    // than DEFAULT_HIT_TOLERANCE_MM, so placeOpeningTarget returns null.
    const graph = graphWithWalls([wall('w1', { x: 9000, y: 9000 }, { x: 9500, y: 9000 })])
    const { result } = renderHook(() =>
      usePlanAuthoring({
        session,
        tool: 'place-opening',
        activeFloorId: 'g',
        graph,
        placementType: 'single-swing-door',
      }),
    )

    act(() => dispatchWindowKey('Enter'))

    expect(dispatch).not.toHaveBeenCalled()
    expect(result.current.announcement).toMatch(/no wall/i)
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
