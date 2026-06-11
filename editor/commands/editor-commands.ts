import { deleteEntities } from '../../core'
import { selectedEntityIds } from '../plan/selection-entities'
import type { CommandContext, EditorCommand } from './command'

function deleteSelection(context: CommandContext): void {
  const entityIds = selectedEntityIds(context.selection.getSelectedIds())
  if (context.activeFloorId !== null && entityIds.length > 0) {
    context.session.dispatch(deleteEntities(context.activeFloorId, entityIds))
    context.selection.clear()
  }
}

const undoCommand: EditorCommand = {
  id: 'undo',
  label: 'Undo',
  keybindings: ['Mod+Z'],
  isEnabled: (context) => context.session.canUndo(),
  run: (context) => {
    context.session.undo()
  },
}

const redoCommand: EditorCommand = {
  id: 'redo',
  label: 'Redo',
  keybindings: ['Mod+Shift+Z', 'Mod+Y'],
  isEnabled: (context) => context.session.canRedo(),
  run: (context) => {
    context.session.redo()
  },
}

const deleteSelectionCommand: EditorCommand = {
  id: 'delete-selection',
  label: 'Delete selection',
  keybindings: ['Delete', 'Backspace'],
  isEnabled: (context) =>
    context.activeFloorId !== null && context.selection.getSelectedIds().size > 0,
  run: deleteSelection,
}

const deselectCommand: EditorCommand = {
  id: 'deselect',
  label: 'Deselect',
  keybindings: ['Escape'],
  isEnabled: (context) => context.selection.getSelectedIds().size > 0,
  run: (context) => {
    context.selection.clear()
  },
}

const openCommandPaletteCommand: EditorCommand = {
  id: 'open-command-palette',
  label: 'Command palette',
  keybindings: ['Mod+K'],
  isEnabled: () => true,
  run: (context) => {
    context.openPalette()
  },
}

/** The editor's command set: undo, redo, delete, deselect, and the palette opener. */
export function createEditorCommands(): EditorCommand[] {
  return [
    undoCommand,
    redoCommand,
    deleteSelectionCommand,
    deselectCommand,
    openCommandPaletteCommand,
  ]
}
