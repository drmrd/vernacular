import type { EditorCommand } from './command'

/** The explicit-save command: flush and confirm the project save, the menu and keyboard entry point now that the header Save button is gone. */
export function createSaveCommand(onSave: () => void): EditorCommand {
  return {
    id: 'save',
    label: 'Save',
    keybindings: ['Mod+S'],
    isEnabled: () => true,
    run: () => onSave(),
  }
}
