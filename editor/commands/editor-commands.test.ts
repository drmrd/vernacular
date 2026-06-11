import { describe, it, expect, vi } from 'vitest'
import { createEditorCommands } from './editor-commands'
import type { CommandContext } from './command'
import { createEditorSession, createSelectionStore } from '../../bridge'
import { addFloor, addWall, createEmptyProject } from '../../core'

const WALL_NODE_ID_PREFIX = 'wall:'

function buildContext(): {
  context: CommandContext
  floorId: string
  wallId: string
  openPalette: ReturnType<typeof vi.fn>
} {
  const session = createEditorSession(
    createEmptyProject({
      name: 'Test',
      units: 'metric',
      period: 'modern',
      appVersion: '0.0.0',
    }),
  )
  session.dispatch(addFloor('Ground'))
  const floorId = session.getProject().floors[0]!.id
  session.dispatch(addWall(floorId, { x: 0, y: 0 }, { x: 500, y: 0 }))
  const wallId = session.getProject().floors[0]!.walls[0]!.id

  const selection = createSelectionStore()
  const openPalette = vi.fn()
  const context: CommandContext = {
    session,
    selection,
    graph: session.getSceneGraph(),
    activeFloorId: floorId,
    openPalette,
  }

  return { context, floorId, wallId, openPalette }
}

function commandById(id: string) {
  const command = createEditorCommands().find((entry) => entry.id === id)
  if (!command) {
    throw new Error(`No command with id "${id}"`)
  }
  return command
}

describe('createEditorCommands', () => {
  it('enables undo only once there is a dispatched command and reverts a wall when run', () => {
    const session = createEditorSession(
      createEmptyProject({
        name: 'Test',
        units: 'metric',
        period: 'modern',
        appVersion: '0.0.0',
      }),
    )
    const selection = createSelectionStore()
    const undo = commandById('undo')

    const freshContext: CommandContext = {
      session,
      selection,
      graph: session.getSceneGraph(),
      activeFloorId: null,
      openPalette: vi.fn(),
    }
    expect(undo.isEnabled(freshContext)).toBe(false)

    session.dispatch(addFloor('Ground'))
    const floorId = session.getProject().floors[0]!.id
    session.dispatch(addWall(floorId, { x: 0, y: 0 }, { x: 500, y: 0 }))

    const context: CommandContext = {
      session,
      selection,
      graph: session.getSceneGraph(),
      activeFloorId: floorId,
      openPalette: vi.fn(),
    }
    expect(undo.isEnabled(context)).toBe(true)
    expect(session.getSceneGraph().walls).toHaveLength(1)

    undo.run(context)

    expect(session.getSceneGraph().walls).toHaveLength(0)
  })

  it('enables redo after an undo and re-adds the wall when run', () => {
    const { context } = buildContext()
    const undo = commandById('undo')
    const redo = commandById('redo')

    undo.run(context)
    expect(context.session.getSceneGraph().walls).toHaveLength(0)
    expect(redo.isEnabled(context)).toBe(true)

    redo.run(context)

    expect(context.session.getSceneGraph().walls).toHaveLength(1)
  })

  it('enables delete-selection only with a selection and removes the wall while clearing the selection', () => {
    const { context, wallId } = buildContext()
    const deleteSelection = commandById('delete-selection')

    expect(deleteSelection.isEnabled(context)).toBe(false)

    context.selection.select(WALL_NODE_ID_PREFIX + wallId)
    expect(deleteSelection.isEnabled(context)).toBe(true)

    deleteSelection.run(context)

    expect(context.session.getSceneGraph().walls).toHaveLength(0)
    expect(context.selection.getSelectedIds().size).toBe(0)
  })

  it('clears the selection when deselect runs', () => {
    const { context, wallId } = buildContext()
    const deselect = commandById('deselect')

    context.selection.select(WALL_NODE_ID_PREFIX + wallId)
    expect(context.selection.getSelectedIds().size).toBe(1)

    deselect.run(context)

    expect(context.selection.getSelectedIds().size).toBe(0)
  })

  it('invokes the injected palette opener when open-command-palette runs', () => {
    const { context, openPalette } = buildContext()
    const openCommandPalette = commandById('open-command-palette')

    openCommandPalette.run(context)

    expect(openPalette).toHaveBeenCalledTimes(1)
  })
})
