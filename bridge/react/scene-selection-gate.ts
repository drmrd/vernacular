import type { NavMode } from './scene-nav-toolbar'

/**
 * Whether a canvas click should commit a selection in the current navigation mode. A walk-
 * mode click engages pointer lock for mouse-look only, so it must not also select whatever
 * sat under the cursor; every other (non-walk) mode treats a click as a selection pick.
 * Keying on "not walk" keeps any future non-walk mode on the selection-allowed branch.
 */
export function selectionEnabledForMode(mode: NavMode): boolean {
  return mode !== 'walk'
}
