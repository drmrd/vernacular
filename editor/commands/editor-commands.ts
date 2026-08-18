import { deleteEntities, removeFurniture } from '../../core'
import { selectedEntityIds } from '../plan/selection-entities'
import type { CommandContext, EditorCommand } from './command'

// Furniture never reaches the scene graph, so the generic deleteEntities cannot
// remove it. The ids of the selected pieces come from the active floor instead;
// furniture carries raw, unprefixed ids, so the selection is matched directly.
function selectedFurnitureIds(context: CommandContext, floorId: string): string[] {
  const floor = context.session.getProject().floors.find((entry) => entry.id === floorId)
  const selected = context.selection.getSelectedIds()
  return (floor?.furniture ?? []).filter((item) => selected.has(item.id)).map((item) => item.id)
}

/**
 * The single owner of Delete and Backspace: one keystroke removes the selected
 * graph entities and the selected furniture, then clears the selection. The plan's
 * selection keyboard deliberately leaves the key alone, so nothing removes the same
 * entity twice and a deleted wall comes back on one undo.
 *
 * Graph entities are removed together, but each furniture piece still costs its own
 * command, so a multi-piece selection takes one undo per piece. Batching that into a
 * single history entry needs a coalescing remove in core and is separate work.
 */
function deleteSelection(context: CommandContext): void {
  const floorId = context.activeFloorId
  if (floorId === null) {
    return
  }
  const entityIds = selectedEntityIds(context.selection.getSelectedIds())
  const furnitureIds = selectedFurnitureIds(context, floorId)
  if (entityIds.length === 0 && furnitureIds.length === 0) {
    return
  }
  if (entityIds.length > 0) {
    context.session.dispatch(deleteEntities(floorId, entityIds))
  }
  for (const furnitureId of furnitureIds) {
    context.session.dispatch(removeFurniture(floorId, furnitureId))
  }
  context.selection.clear()
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

/** The palette's own opener, which the open palette leaves out of its list. */
export const OPEN_PALETTE_COMMAND_ID = 'open-command-palette'

const openCommandPaletteCommand: EditorCommand = {
  id: OPEN_PALETTE_COMMAND_ID,
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
