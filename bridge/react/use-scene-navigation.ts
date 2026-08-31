import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import type { SceneSessionStore } from '../scene-session/scene-session-store'

import type { PresetRequest } from './scene-camera-effects'
import type { PresetChoice } from './scene-nav-toolbar'
import {
  sceneSessionSetter,
  sceneSessionToggle,
  useSceneSessionStoreOrLocal,
} from './scene-session-context'

/**
 * The per-view camera navigation state: the active mode, whether the user has taken control
 * of the camera, and the pose the last camera preset actually landed on. The state lives in
 * the scene session store, so it outlasts the preview subtree's unmount when the view mode
 * changes (ADR-0170). The state stays out of the model and undo history whichever store backs
 * it. Reset clears user control, which lets FrameCamera refit the model to the viewport
 * through its `active` transition.
 */
export function useSceneNavigation() {
  const store = useSceneSessionStoreOrLocal()
  const session = useSyncExternalStore(store.subscribe, store.getSceneSession)
  const writers = useSceneSessionWriters(store)
  // A saved camera position is the mark of a viewer who was steering, so a mount that finds
  // one starts out of the way rather than reframing the model under them.
  const [userControlled, setUserControlled] = useState(
    () => store.getSceneSession().savedCameraPosition !== null,
  )
  const [presetRequest, setPresetRequest] = useState<PresetRequest | null>(null)
  const markUserControlled = useCallback(() => setUserControlled(true), [])
  // Reset drops the applied preset along with user control, so the camera goes back to
  // pivoting on the model's own framing rather than on wherever a preset left it. It leaves
  // the last presetRequest in place on purpose: a stale request cannot re-fire, because
  // PresetCamera's effect depends on the request's identity, which reset does not change.
  const resetView = useCallback(() => {
    setUserControlled(false)
    writers.clearPresetPose()
  }, [writers])
  // Applying a preset takes camera control (so the framing does not override it) and
  // bumps the nonce so PresetCamera reapplies even when the same preset is re-picked.
  const applyPreset = useCallback((preset: PresetChoice) => {
    setUserControlled(true)
    setPresetRequest((previous) => ({ preset, nonce: (previous?.nonce ?? 0) + 1 }))
  }, [])
  return {
    mode: session.cameraMode,
    setMode: writers.setMode,
    selectionEnabled: session.selectionEnabled,
    toggleSelection: writers.toggleSelection,
    revealInterior: session.revealInterior,
    toggleRevealInterior: writers.toggleRevealInterior,
    userControlled,
    markUserControlled,
    resetView,
    presetRequest,
    applyPreset,
    // Reported back by PresetCamera once a preset pose reaches the live camera. The orbit
    // controller pivots on this pose's target, so the first drag after a preset turns around
    // what the preset framed instead of yanking the view back to the model's framing.
    presetPose: session.presetPose,
    notePresetApplied: writers.notePresetApplied,
    // The departing canvas notes where the camera was standing so the next mount reopens
    // there instead of reframing the model (ADR-0170). Orbit saves the position only, not
    // the target it was turning around; issue #619 covers restoring the whole pose.
    savedCameraPosition: session.savedCameraPosition,
    noteCameraLeft: writers.noteCameraLeft,
  }
}

/**
 * The writes navigation makes to the session store, bundled so the hook that returns them
 * reads as one list of names.
 */
function useSceneSessionWriters(store: SceneSessionStore) {
  return useMemo(
    () => ({
      setMode: sceneSessionSetter(store, 'cameraMode'),
      toggleSelection: sceneSessionToggle(store, 'selectionEnabled'),
      toggleRevealInterior: sceneSessionToggle(store, 'revealInterior'),
      notePresetApplied: sceneSessionSetter(store, 'presetPose'),
      noteCameraLeft: sceneSessionSetter(store, 'savedCameraPosition'),
      clearPresetPose: () => store.updateSceneSession({ presetPose: null }),
    }),
    [store],
  )
}

/**
 * The grouped result of useSceneNavigation, so the toolbar and canvas wiring can take the
 * whole navigation state as one prop instead of re-listing each field.
 */
export type SceneNavigationState = ReturnType<typeof useSceneNavigation>
