import { entranceOf, entranceRoleOf, markMainEntrance, openingKindOfType } from '../../core'
import { singleSelectedOpening } from '../plan/opening-inspector-context'
import type { CommandContext, EditorCommand } from './command'

// The selected door that is not yet marked as the main entrance, or null.
function unmarkedSelectedDoor(context: CommandContext) {
  const selected = singleSelectedOpening(
    context.selection.getSelectedIds(),
    context.session.getProject(),
    context.activeFloorId,
  )
  if (selected === null || openingKindOfType(selected.opening.type) !== 'door') {
    return null
  }
  const role = entranceRoleOf(entranceOf(context.graph), selected.floorId, selected.opening.id)
  return role === 'marked' ? null : selected
}

const markMainEntranceCommand: EditorCommand = {
  id: 'mark-main-entrance',
  label: 'Mark as main entrance',
  keybindings: [],
  isEnabled: (context) => unmarkedSelectedDoor(context) !== null,
  run: (context) => {
    const door = unmarkedSelectedDoor(context)
    if (door !== null) {
      context.session.dispatch(markMainEntrance(door.floorId, door.opening.id))
    }
  },
}

/** The command that marks the one selected door as the project's main entrance. */
export function createEntranceCommands(): EditorCommand[] {
  return [markMainEntranceCommand]
}
