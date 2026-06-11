import type { ViewControls } from '../viewport/view-mode'
import { VIEW_MODE_LABELS } from '../viewport/view-mode-labels'
import type { EditorCommand } from './command'

/** The view-mode commands: show the plan, split, and 3D viewports. */
export function createViewCommands(view: ViewControls): EditorCommand[] {
  return [
    {
      id: 'show-plan',
      label: VIEW_MODE_LABELS.plan,
      keybindings: ['1'],
      isEnabled: () => true,
      run: () => view.setMode('plan'),
    },
    {
      id: 'show-split',
      label: VIEW_MODE_LABELS.split,
      keybindings: ['2'],
      isEnabled: () => true,
      run: () => view.setMode('split'),
    },
    {
      id: 'show-3d',
      label: VIEW_MODE_LABELS.preview,
      keybindings: ['3'],
      isEnabled: () => true,
      run: () => view.setMode('preview'),
    },
  ]
}
