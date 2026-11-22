import type { SceneSessionState, SceneSessionStore } from './scene-session-store'

/**
 * Whether every interactive object in the 3D view sits in its default state, so a reset would
 * change nothing.
 */
export function interactiveObjectsAtDefault(session: SceneSessionState): boolean {
  return session.openDoorIds.size === 0
}

/**
 * Returns every interactive object in the 3D view to its default state; today that closes every
 * opened door and window. A store already at its defaults is left untouched, so no subscriber is
 * notified.
 */
export function resetInteractiveObjects(store: SceneSessionStore): void {
  if (interactiveObjectsAtDefault(store.getSceneSession())) {
    return
  }
  store.updateSceneSession({ openDoorIds: new Map() })
}
