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

// Mounts only the plan's selection keyboard, the owner of the arrow-key nudge.
function mountSelectionKeyboard({ session, selection, floorId }: Editor): void {
  const clipboard = createClipboardStore()
  renderHook(() =>
    useSelectionKeyboard({
      session,
      selection,
      clipboard,
      selectedIds: selection.getSelectedIds(),
      tool: 'select',
      activeFloorId: floorId,
      furniture: [],
    }),
  )
}

describe('nudging a selection with the arrow keys', () => {
  it('leaves the selection alone when the arrow key is aimed at a control', () => {
    const editor = buildEditorWithSelectedWall()
    mountSelectionKeyboard(editor)
    const before = editor.session.getProject().floors[0]!.walls[0]!

    const toolButton = document.createElement('button')
    document.body.appendChild(toolButton)
    toolButton.focus()
    toolButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    toolButton.remove()

    expect(editor.session.getProject().floors[0]!.walls[0]).toEqual(before)
  })

  it('still nudges when the arrow key lands on the drawing surface', () => {
    const editor = buildEditorWithSelectedWall()
    mountSelectionKeyboard(editor)
    const before = editor.session.getProject().floors[0]!.walls[0]!

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))

    expect(editor.session.getProject().floors[0]!.walls[0]).not.toEqual(before)
  })
})

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
