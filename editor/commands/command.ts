import type { SceneGraph } from '../../core'
import type { EditorSession, SelectionStore } from '../../bridge'
import { parseKeybinding, eventToKeystroke, keystrokesMatch } from './keybinding'

export interface CommandContext {
  session: EditorSession
  selection: SelectionStore
  graph: SceneGraph
  activeFloorId: string | null
  openPalette: () => void
}

export interface EditorCommand {
  id: string
  label: string
  keybindings: string[]
  isEnabled: (context: CommandContext) => boolean
  run: (context: CommandContext) => void
}

/** Find the first enabled command whose keybinding matches the event, or null. */
// eslint-disable-next-line max-params -- the command list, the event, the platform flag, and the context are the minimal inputs to resolve a keystroke
export function resolveCommandForEvent(
  commands: EditorCommand[],
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>,
  isMac: boolean,
  context: CommandContext,
): EditorCommand | null {
  const keystroke = eventToKeystroke(event, isMac)
  for (const command of commands) {
    if (!command.isEnabled(context)) {
      continue
    }
    const matches = command.keybindings.some((binding) =>
      keystrokesMatch(parseKeybinding(binding), keystroke),
    )
    if (matches) {
      return command
    }
  }
  return null
}
