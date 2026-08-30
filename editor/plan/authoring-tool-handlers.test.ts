import { describe, it, expect, vi } from 'vitest'
import type { EditorSession } from '../../bridge'
import { handleDimensionKey, handleWallKey, type AuthoringRun } from './authoring-tool-handlers'
import { advanceDimensionTool, IDLE_DIMENSION_TOOL } from './dimension-tool'
import { advanceWallTool, IDLE_WALL_TOOL } from './wall-tool'
import { wasKeystrokeClaimed } from './keyboard-guard'

function fakeSession(dispatch = vi.fn()): EditorSession {
  return {
    dispatch,
    getProject: () => ({ floors: [{ id: 'g' }] }),
  } as unknown as EditorSession
}

function authoringRun(session: EditorSession): AuthoringRun {
  return {
    session,
    activeFloorId: 'g',
    candidate: { x: 0, y: 0 },
    setCandidate: vi.fn(),
    setAnnouncement: vi.fn(),
  }
}

function escapeEvent(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
}

describe('handleDimensionKey', () => {
  it('abandons a measurement in progress on Escape and records nothing', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    const measuring = advanceDimensionTool(IDLE_DIMENSION_TOOL, { x: 100, y: 100 }, 'g').state
    const setToolState = vi.fn()
    const setAnnouncement = vi.fn()

    handleDimensionKey({
      ...authoringRun(session),
      setAnnouncement,
      event: escapeEvent(),
      toolState: measuring,
      setToolState,
    })

    expect(setToolState).toHaveBeenCalledWith(IDLE_DIMENSION_TOOL)
    expect(dispatch).not.toHaveBeenCalled()
    expect(setAnnouncement).toHaveBeenCalledWith('Dimension cancelled')
  })

  it('claims the Escape it cancelled on, so the tool stays armed for the next measurement', () => {
    const session = fakeSession()
    const measuring = advanceDimensionTool(IDLE_DIMENSION_TOOL, { x: 100, y: 100 }, 'g').state
    const event = escapeEvent()

    handleDimensionKey({
      ...authoringRun(session),
      event,
      toolState: measuring,
      setToolState: vi.fn(),
    })

    expect(wasKeystrokeClaimed(event)).toBe(true)
  })

  it('leaves an idle dimension tool to the Escape ladder', () => {
    const session = fakeSession()
    const event = escapeEvent()
    const setToolState = vi.fn()

    handleDimensionKey({
      ...authoringRun(session),
      event,
      toolState: IDLE_DIMENSION_TOOL,
      setToolState,
    })

    expect(setToolState).not.toHaveBeenCalled()
    expect(wasKeystrokeClaimed(event)).toBe(false)
  })
})

describe('handleWallKey', () => {
  it('claims the Escape that cancelled an open run', () => {
    const session = fakeSession()
    const drawing = advanceWallTool(IDLE_WALL_TOOL, { x: 0, y: 0 }, 'g').state
    const event = escapeEvent()

    handleWallKey({ ...authoringRun(session), event, toolState: drawing, setToolState: vi.fn() })

    expect(wasKeystrokeClaimed(event)).toBe(true)
  })

  it('leaves an idle wall tool to the Escape ladder', () => {
    const session = fakeSession()
    const event = escapeEvent()

    handleWallKey({
      ...authoringRun(session),
      event,
      toolState: IDLE_WALL_TOOL,
      setToolState: vi.fn(),
    })

    expect(wasKeystrokeClaimed(event)).toBe(false)
  })
})
