import { useCallback, useState } from 'react'

import type { CameraPose } from '../../core'

import type { PresetRequest } from './scene-camera-effects'
import type { NavMode, PresetChoice } from './scene-nav-toolbar'

/**
 * The per-view camera navigation state: the active mode, whether the user has taken control
 * of the camera, and the pose the last camera preset actually landed on. Session state held
 * in the view layer, never in the model or undo. Reset clears user control, which lets
 * FrameCamera refit the model to the viewport through its `active` transition.
 */
export function useSceneNavigation() {
  const [mode, setMode] = useState<NavMode>('orbit')
  const [selectionEnabled, setSelectionEnabled] = useState(false)
  const [revealInterior, setRevealInterior] = useState(true)
  const [userControlled, setUserControlled] = useState(false)
  const [presetRequest, setPresetRequest] = useState<PresetRequest | null>(null)
  const [presetPose, setPresetPose] = useState<CameraPose | null>(null)
  const markUserControlled = useCallback(() => setUserControlled(true), [])
  const toggleSelection = useCallback(() => setSelectionEnabled((value) => !value), [])
  const toggleRevealInterior = useCallback(() => setRevealInterior((value) => !value), [])
  // Reset drops the applied preset along with user control, so the camera goes back to
  // pivoting on the model's own framing rather than on wherever a preset left it. It leaves
  // the last presetRequest in place on purpose: a stale request cannot re-fire, because
  // PresetCamera's effect depends on the request's identity, which reset does not change.
  const resetView = useCallback(() => {
    setUserControlled(false)
    setPresetPose(null)
  }, [])
  // Applying a preset takes camera control (so the framing does not override it) and
  // bumps the nonce so PresetCamera reapplies even when the same preset is re-picked.
  const applyPreset = useCallback((preset: PresetChoice) => {
    setUserControlled(true)
    setPresetRequest((previous) => ({ preset, nonce: (previous?.nonce ?? 0) + 1 }))
  }, [])
  // Reported back by PresetCamera once a preset pose reaches the live camera. The orbit
  // controller pivots on this pose's target, so the first drag after a preset turns around
  // what the preset framed instead of yanking the view back to the model's framing.
  const notePresetApplied = useCallback((pose: CameraPose) => setPresetPose(pose), [])
  return {
    mode,
    setMode,
    selectionEnabled,
    toggleSelection,
    revealInterior,
    toggleRevealInterior,
    userControlled,
    markUserControlled,
    resetView,
    presetRequest,
    applyPreset,
    presetPose,
    notePresetApplied,
  }
}

/**
 * The grouped result of useSceneNavigation, so the toolbar and canvas wiring can take the
 * whole navigation state as one prop instead of re-listing each field.
 */
export type SceneNavigationState = ReturnType<typeof useSceneNavigation>
