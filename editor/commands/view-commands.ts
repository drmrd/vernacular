import type { ViewControls } from '../viewport/view-mode'
import type { EditorCommand } from './command'

/** The view-mode commands: show the plan, split, and 3D viewports. */
export function createViewCommands(view: ViewControls): EditorCommand[] {
  return [
    {
      id: 'show-plan',
      label: 'Plan view',
      keybindings: ['1'],
      isEnabled: () => true,
      run: () => view.setMode('plan'),
    },
    {
      id: 'show-split',
      label: 'Split view',
      keybindings: ['2'],
      isEnabled: () => true,
      run: () => view.setMode('split'),
    },
    {
      id: 'show-3d',
      label: '3D view',
      keybindings: ['3'],
      isEnabled: () => true,
      run: () => view.setMode('preview'),
    },
  ]
}
