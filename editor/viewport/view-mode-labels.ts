import type { ViewMode } from './view-mode'

/** The view modes in toolbar order, and the single source of their display labels. */
export const VIEW_MODES: readonly ViewMode[] = ['plan', 'split', 'preview']

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  plan: 'Plan view',
  split: 'Split view',
  preview: '3D view',
}
