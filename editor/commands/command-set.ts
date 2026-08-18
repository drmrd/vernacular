import type { SnapPreferencesStore } from '../plan/snap-preferences-store'
import type { ViewControls } from '../viewport/view-mode'
import type { EditorCommand } from './command'
import { createEditorCommands } from './editor-commands'
import { createSaveCommand } from './save-command'
import { createSnapCommands } from './snap-commands'
import { createViewCommands } from './view-commands'

export interface CommandSetDeps {
  view: ViewControls
  snapStore: SnapPreferencesStore
  /** Absent when the editor has nothing to save to, which drops the Save command. */
  onSave?: (() => void) | undefined
}

/**
 * The editor's whole command set, assembled once. Both the keys and the palette
 * read from this, so a command can never be reachable by one and missing from the
 * other, and a new command joins both by being added here.
 *
 * Order is resolution order: the first enabled command whose binding matches a
 * keystroke wins, so the editing verbs come before the view and snap toggles.
 */
export function createCommandSet({ view, snapStore, onSave }: CommandSetDeps): EditorCommand[] {
  return [
    ...createEditorCommands(),
    ...createViewCommands(view),
    ...createSnapCommands(snapStore),
    ...(onSave ? [createSaveCommand(onSave)] : []),
  ]
}
