import { describe, it, expect, vi } from 'vitest'
import type { EditorSession } from '../../bridge'
import { createSelectionStore } from '../../bridge'
import type { Command, PlaceFurnitureParams, PlaceOpeningParams } from '../../core'
import { createOpening, OPENING_NODE_PREFIX } from '../../core'
import type { LibraryItem } from '../../storage'
import {
  handleDimensionKey,
  handleFurnitureKey,
  handleOpeningKey,
  handleWallKey,
  type AuthoringRun,
} from './authoring-tool-handlers'
import {
  CLEAR_OF_WALL_Y,
  DOOR_TYPE,
  FLOOR_ID,
  graphWithOneWall,
  sessionWithOpenings,
  WALL_MIDPOINT_X,
} from './authoring-tool-handlers-test-fixtures'
import { advanceDimensionTool, IDLE_DIMENSION_TOOL } from './dimension-tool'
import { advanceWallTool, IDLE_WALL_TOOL } from './wall-tool'
import { wasKeystrokeClaimed } from './keyboard-guard'

const NO_ROTATION_DEGREES = 0

function fakeSession(dispatch = vi.fn()): EditorSession {
  return {
    dispatch,
    getProject: () => ({ floors: [{ id: FLOOR_ID }] }),
  } as unknown as EditorSession
}

function authoringRun(session: EditorSession): AuthoringRun {
  return {
    session,
    activeFloorId: FLOOR_ID,
    candidate: { x: 0, y: 0 },
    setCandidate: vi.fn(),
    setAnnouncement: vi.fn(),
    selection: createSelectionStore(),
  }
}

function escapeEvent(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
}

function enterEvent(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
}

const chair: LibraryItem = {
  reference: { scope: 'user', contentHash: 'hash-1' },
  name: 'Chair',
  kind: 'furniture',
  categories: [],
  eras: [],
  footprint: { width: 600, depth: 600 },
  height: 750,
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

describe('handleOpeningKey selects what it drops', () => {
  it('selects the opening a candidate on the wall drops', () => {
    const dispatch = vi.fn()
    const session = sessionWithOpenings([], dispatch)
    const run = {
      ...authoringRun(session),
      candidate: { x: WALL_MIDPOINT_X, y: 0 },
    }

    handleOpeningKey({
      ...run,
      event: enterEvent(),
      graph: graphWithOneWall(),
      placementType: DOOR_TYPE,
      setPlacementRefusal: vi.fn(),
    })

    expect(dispatch).toHaveBeenCalledTimes(1)
    const [command] = dispatch.mock.calls[0] as [Command<PlaceOpeningParams>]
    expect(run.selection.getSelectedIds()).toEqual(
      new Set([`${OPENING_NODE_PREFIX}${command.params.opening.id}`]),
    )
  })

  it('drops and selects nothing for a candidate clear of every wall', () => {
    const dispatch = vi.fn()
    const session = sessionWithOpenings([], dispatch)
    const run = {
      ...authoringRun(session),
      candidate: { x: WALL_MIDPOINT_X, y: CLEAR_OF_WALL_Y },
    }

    handleOpeningKey({
      ...run,
      event: enterEvent(),
      graph: graphWithOneWall(),
      placementType: DOOR_TYPE,
      setPlacementRefusal: vi.fn(),
    })

    expect(dispatch).not.toHaveBeenCalled()
    expect(run.selection.getSelectedIds()).toEqual(new Set())
  })

  it('refuses a drop on top of a door already in the wall and leaves the saying to the notice', () => {
    const dispatch = vi.fn()
    const existingDoor = createOpening({
      id: 'existing',
      type: DOOR_TYPE,
      hostWallId: 'w1',
      position: WALL_MIDPOINT_X,
    })
    const session = sessionWithOpenings([existingDoor], dispatch)
    const run = {
      ...authoringRun(session),
      candidate: { x: WALL_MIDPOINT_X, y: 0 },
    }

    handleOpeningKey({
      ...run,
      event: enterEvent(),
      graph: graphWithOneWall(),
      placementType: DOOR_TYPE,
      setPlacementRefusal: vi.fn(),
    })

    expect(dispatch).not.toHaveBeenCalled()
    expect(run.selection.getSelectedIds()).toEqual(new Set())
    expect(run.setAnnouncement).toHaveBeenCalledWith('')
  })
})

describe('handleFurnitureKey selects what it drops', () => {
  it('selects the furniture an armed item drops', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    const run = authoringRun(session)

    handleFurnitureKey({
      ...run,
      event: enterEvent(),
      armed: chair,
      rotation: NO_ROTATION_DEGREES,
    })

    expect(dispatch).toHaveBeenCalledTimes(1)
    const [command] = dispatch.mock.calls[0] as [Command<PlaceFurnitureParams>]
    expect(run.selection.getSelectedIds()).toEqual(new Set([command.params.furniture.id]))
  })

  it('drops and selects nothing with no item armed', () => {
    const dispatch = vi.fn()
    const session = fakeSession(dispatch)
    const run = authoringRun(session)

    handleFurnitureKey({
      ...run,
      event: enterEvent(),
      armed: null,
      rotation: NO_ROTATION_DEGREES,
    })

    expect(dispatch).not.toHaveBeenCalled()
    expect(run.selection.getSelectedIds()).toEqual(new Set())
  })
})
