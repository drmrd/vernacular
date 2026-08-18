import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { createClipboardStore, createEditorSession, createSelectionStore } from '../../bridge'
import { addFloor, addWall, createEmptyProject } from '../../core'
import type { CommandContext } from '../commands/command'
import { createEditorCommands } from '../commands/editor-commands'
import { useKeybindings } from '../commands/use-keybindings'
import { useSelectionKeyboard } from './use-selection-keyboard'

afterEach(cleanup)

const WALL_NODE_ID_PREFIX = 'wall:'

interface Editor {
  session: ReturnType<typeof createEditorSession>
  selection: ReturnType<typeof createSelectionStore>
  floorId: string
}

function buildEditorWithSelectedWall(): Editor {
  const session = createEditorSession(
    createEmptyProject({ name: 'Test', units: 'metric', period: 'modern', appVersion: '0.0.0' }),
  )
  session.dispatch(addFloor('Ground'))
  const floorId = session.getProject().floors[0]!.id
  session.dispatch(addWall(floorId, { x: 0, y: 0 }, { x: 500, y: 0 }))
  const wallId = session.getProject().floors[0]!.walls[0]!.id
  const selection = createSelectionStore()
  selection.select(WALL_NODE_ID_PREFIX + wallId)
  return { session, selection, floorId }
}

// Mounts the two window listeners that both used to claim Delete: the global
// keybinding layer the shell installs and the plan's selection keyboard.
function mountKeyboardOwners({ session, selection, floorId }: Editor): void {
  const context: CommandContext = {
    session,
    selection,
    graph: session.getSceneGraph(),
    activeFloorId: floorId,
    openPalette: vi.fn(),
  }
  const commands = createEditorCommands()
  const clipboard = createClipboardStore()
  renderHook(() => {
    useKeybindings(commands, context)
    useSelectionKeyboard({
      session,
      selection,
      clipboard,
      selectedIds: selection.getSelectedIds(),
      tool: 'select',
      activeFloorId: floorId,
      furniture: [],
    })
  })
}

describe('deleting a selection from the keyboard', () => {
  it('records one history entry per Delete, so a single undo restores the wall', () => {
    const editor = buildEditorWithSelectedWall()
    mountKeyboardOwners(editor)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))

    expect(editor.session.getSceneGraph().walls).toHaveLength(0)

    editor.session.undo()

    expect(editor.session.getSceneGraph().walls).toHaveLength(1)
  })
})
