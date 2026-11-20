import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import type { SavedCamera, SceneSessionStore } from '../scene-session/scene-session-store'

import type { PresetRequest } from './scene-camera-effects'
import type { PresetChoice } from './scene-nav-toolbar'
import {
  sceneSessionSetter,
  sceneSessionToggle,
  useSceneSessionStoreOrLocal,
} from './scene-session-context'

/**
 * The per-view camera navigation state: the active mode, whether the user has taken control
 * of the camera, the pose the last camera preset actually landed on, and the handoffs the
 * cameras use to resume where they left off (the saved camera, the walk pose, and the
 * open doors). The camera is kept only for a pane the user steered. The state lives in the scene session store, so it outlasts the preview
 * subtree's unmount when the view mode changes (ADR-0170). The state stays out of the model
 * and undo history whichever store backs it. Reset clears user control, which lets FrameCamera
 * refit the model to the viewport through its `active` transition.
 */
export function useSceneNavigation() {
  const store = useSceneSessionStoreOrLocal()
  const session = useSyncExternalStore(store.subscribe, store.getSceneSession)
  const writers = useSceneSessionWriters(store)
  // Only a steered pane leaves a camera behind (see useCameraLeaveNote), so a mount that
  // finds one starts out of the way rather than reframing the model under the viewer.
  const [userControlled, setUserControlled] = useState(
    () => store.getSceneSession().savedCamera !== null,
  )
  const noteCameraLeft = useCameraLeaveNote(store, userControlled)
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
    // there instead of reframing the model (ADR-0170). The whole camera comes back, the
    // position and the orbit pivot together, so a restored session looks where it looked
    // before rather than turning back toward the model's framing. Only a steered pane keeps
    // its camera; an untouched pane leaves none, so the next mount frames the model again.
    savedCamera: session.savedCamera,
    noteCameraLeft,
    // The pose the departing walker ended on, so returning to walk mode resumes there
    // rather than reseeding from wherever the camera has since been left (ADR-0170).
    walkPose: session.walkPose,
    noteWalkPose: writers.noteWalkPose,
    // The doors the session holds open; the live openings follow this set in both camera
    // modes (ADR-0198).
    openDoorIds: session.openDoorIds,
    noteOpenDoors: writers.noteOpenDoors,
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
      noteWalkPose: sceneSessionSetter(store, 'walkPose'),
      noteOpenDoors: sceneSessionSetter(store, 'openDoorIds'),
      clearPresetPose: () => store.updateSceneSession({ presetPose: null }),
    }),
    [store],
  )
}

/**
 * The departing pane's note of where its camera stood. The session keeps the camera only when
 * the navigation is steered at the moment of the call and forgets it otherwise, because the next
 * mount reads a saved camera as a steered viewer. The identity stays stable across renders and
 * the call reads the newest steering flag, since the pane calls it once as it unmounts.
 */
function useCameraLeaveNote(
  store: SceneSessionStore,
  userControlled: boolean,
): (camera: SavedCamera) => void {
  const userControlledRef = useRef(userControlled)
  userControlledRef.current = userControlled
  return useCallback(
    (camera: SavedCamera) =>
      store.updateSceneSession({ savedCamera: userControlledRef.current ? camera : null }),
    [store],
  )
}

/**
 * The grouped result of useSceneNavigation, so the toolbar and canvas wiring can take the
 * whole navigation state as one prop instead of re-listing each field.
 */
export type SceneNavigationState = ReturnType<typeof useSceneNavigation>
