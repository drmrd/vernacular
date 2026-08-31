import { DEFAULT_COLOR_TEMPERATURE_K, type CameraPose, type WalkState } from '../../core'

/**
 * Session state for the 3D preview, owned by the bridge rather than by the preview itself.
 *
 * Switching the view mode unmounts the preview subtree, so any state held inside it is
 * discarded. Keeping the state in a store that outlives the subtree lets a returning viewer
 * pick up the camera, scope, and reveal settings they left behind. ADR-0172 records the
 * decision.
 *
 * The shape copies `createEnvironmentSessionStore`: a factory closing over a snapshot plus a
 * listener set, so both stores read the same way at their call sites and both can back a
 * `useSyncExternalStore` subscription.
 */
export interface SceneSessionState {
  cameraMode: 'orbit' | 'walk'
  selectionEnabled: boolean
  revealInterior: boolean
  presetPose: CameraPose | null
  colorTemperatureK: number
  scope: 'floor' | 'building'
  showUnderground: boolean
  edgeOverlay: boolean
  openDoorIds: ReadonlySet<string>
  savedCameraPosition: { x: number; y: number; z: number } | null
  walkPose: WalkState | null
}

export const DEFAULT_SCENE_SESSION_STATE: SceneSessionState = Object.freeze({
  cameraMode: 'orbit',
  selectionEnabled: true,
  revealInterior: true,
  presetPose: null,
  colorTemperatureK: DEFAULT_COLOR_TEMPERATURE_K,
  scope: 'floor',
  showUnderground: true,
  edgeOverlay: false,
  openDoorIds: new Set<string>(),
  savedCameraPosition: null,
  walkPose: null,
})

export interface SceneSessionStore {
  getSceneSession(): SceneSessionState
  updateSceneSession(patch: Partial<SceneSessionState>): void
  subscribe(listener: () => void): () => void
}

function changesAnyField(current: SceneSessionState, patch: Partial<SceneSessionState>): boolean {
  const patchedKeys = Object.keys(patch) as (keyof SceneSessionState)[]
  return patchedKeys.some((key) => !Object.is(current[key], patch[key]))
}

export function createSceneSessionStore(
  initial: Partial<SceneSessionState> = {},
): SceneSessionStore {
  let sceneSession: SceneSessionState = { ...DEFAULT_SCENE_SESSION_STATE, ...initial }
  const listeners = new Set<() => void>()

  return {
    getSceneSession: () => sceneSession,
    updateSceneSession(patch) {
      if (!changesAnyField(sceneSession, patch)) {
        return
      }
      sceneSession = { ...sceneSession, ...patch }
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
