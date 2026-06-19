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

/**
 * Whether a canvas click should commit a selection given the user toggle and the navigation
 * mode. Click-to-select is opt-in and off by default: a click commits a selection only when
 * the user has turned the toggle on AND the camera is not in walk mode. Walk-mode clicks stay
 * pure pointer-lock for mouse-look even when the toggle is on, so walk always overrides it.
 * Composes `selectionEnabledForMode` so the "not walk" rule lives in exactly one place.
 */
export function selectionAllowed(input: { enabled: boolean; mode: NavMode }): boolean {
  return input.enabled && selectionEnabledForMode(input.mode)
}
