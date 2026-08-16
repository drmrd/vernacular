import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import {
  cameraPresetPose,
  doorwayPose,
  type Bounds3,
  type CameraPose,
  type OpeningSceneNode,
} from '../../core'
import { applyCameraPose, fitCameraToBounds, fovToRadians, type FittableCamera } from './fit-camera'
import type { PresetChoice } from './scene-nav-toolbar'

// The R3F camera-effect helpers (framing and preset snapping) extracted from the scene
// view so that file stays within its size budget. Each helper is an in-canvas component
// that reads the live camera through useThree and applies a pose as a layout effect.

// Frames the camera on the scene bounds, fitting the model to the live canvas
// aspect ratio and field of view (ADR-0075), while the user has not taken control
// of the camera. It reruns when the canvas size changes, so a pane resize or a move
// between full and split view refits the model instead of leaving a stale frame.
// Once the user orbits or walks, `active` goes false and the fit stops being
// applied, so an edit no longer yanks a navigated camera; clearing user control
// (the reset button) makes `active` true again, which reframes. The live Canvas is
// set to frameloop="always" so interactive camera moves render continuously.
export function FrameCamera({ bounds, active }: { bounds: Bounds3 | null; active: boolean }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  useLayoutEffect(() => {
    if (!active) return
    fitCameraToBounds(camera, bounds, size)
  }, [camera, bounds, active, size])
  return null
}

// A request to snap the camera to a named preset. The nonce changes on every request
// so re-selecting the same preset re-applies it.
export interface PresetRequest {
  preset: PresetChoice
  nonce: number
}

// The live inputs a preset pose needs, captured in a ref so PresetCamera reads the
// latest without the effect re-firing on every change.
interface PresetView {
  bounds: Bounds3 | null
  opening: OpeningSceneNode | null
  size: { width: number; height: number }
  camera: FittableCamera
}

// Derives the pose for a preset request: the doorway view needs the resolved opening
// (none means no pose), and the axis-aligned views fit the live viewport.
function poseForRequest(request: PresetRequest, view: PresetView): CameraPose | null {
  if (view.bounds === null) return null
  if (request.preset === 'doorway') {
    return view.opening === null ? null : doorwayPose(view.opening, view.bounds)
  }
  const aspect = view.size.width / view.size.height
  const fovRadians = fovToRadians(view.camera)
  return cameraPresetPose(request.preset, view.bounds, { aspect, fovRadians })
}

// Snaps the live camera to a preset whenever a new request arrives. It reads the
// latest bounds, opening, size, and camera from a ref so the effect fires only on a
// new request, not on a resize (a resize must not yank the camera onto a preset).
export function PresetCamera({
  request,
  bounds,
  opening,
  onApplied,
}: {
  request: PresetRequest | null
  bounds: Bounds3 | null
  opening: OpeningSceneNode | null
  onApplied: (pose: CameraPose) => void
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const latest = useRef<PresetView>({ camera, size, bounds, opening })
  latest.current = { camera, size, bounds, opening }
  // Held in a ref alongside the view inputs so reporting the applied pose cannot become a
  // reason the effect re-fires; only a new request may move the camera.
  const report = useRef(onApplied)
  report.current = onApplied
  useLayoutEffect(() => {
    if (request === null) return
    const pose = poseForRequest(request, latest.current)
    if (pose === null) return
    applyCameraPose(latest.current.camera, pose)
    report.current(pose)
  }, [request])
  return null
}
