import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import {
  cameraPresetPose,
  doorwayPose,
  frameSceneCamera,
  withDepthRangeOf,
  type CameraPose,
} from '../../core'
import { applyCameraPose, cameraViewport, type FittableCamera } from './fit-camera'
import type { FramingBoxes } from './framed-scene'
import type { PresetChoice } from './scene-nav-toolbar'
import type { DoorwayTarget } from './use-doorway-target'

// The R3F camera-effect helpers (framing and preset snapping) extracted from the scene
// view so that file stays within its size budget. Each helper is an in-canvas component
// that reads the live camera through useThree and applies a pose as a layout effect.

// Frames the camera on the framing box (see FramedScene.framingBounds), fitting it to the
// live canvas aspect ratio and field of view (ADR-0075), and takes the near and far planes
// from the box of everything drawn so the floors outside the frame still render. It does so
// while the user has not taken control of the camera. It reruns when the canvas size changes,
// so a pane resize or a move between full and split view refits the model instead of leaving
// a stale frame. Once the user orbits or walks, `active` goes false and the fit stops being
// applied, so an edit no longer yanks a navigated camera; clearing user control (the reset
// button) makes `active` true again, which reframes. The live Canvas is set to
// frameloop="always" so interactive camera moves render continuously.
export function FrameCamera({ boxes, active }: { boxes: FramingBoxes; active: boolean }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const { framingBounds, bounds } = boxes
  useLayoutEffect(() => {
    if (!active) return
    const fit = frameSceneCamera(framingBounds, cameraViewport(camera, size))
    applyCameraPose(camera, withDepthRangeOf(fit, bounds))
  }, [camera, framingBounds, bounds, active, size])
  return null
}

// A request to snap the camera to a named preset. The nonce changes on every request
// so re-selecting the same preset re-applies it.
export interface PresetRequest {
  preset: PresetChoice
  nonce: number
}

// The door the doorway view stands in, with the elevation of that door's own floor.
export type DoorwayStand = Pick<DoorwayTarget, 'opening' | 'floorElevationMm'>

// The live inputs a preset pose needs, captured in a ref so PresetCamera reads the
// latest without the effect re-firing on every change.
interface PresetView {
  boxes: FramingBoxes
  doorway: DoorwayStand | null
  size: { width: number; height: number }
  camera: FittableCamera
}

// Derives the pose for a preset request: the doorway view needs the resolved door and the
// elevation of its floor (none means no pose), and the axis-aligned views fit the framing box
// to the live viewport. Both take their depth range from the box of everything drawn.
function poseForRequest(request: PresetRequest, view: PresetView): CameraPose | null {
  const { framingBounds, bounds } = view.boxes
  if (bounds === null) return null
  if (request.preset === 'doorway') {
    return view.doorway === null
      ? null
      : doorwayPose(view.doorway.opening, bounds, view.doorway.floorElevationMm)
  }
  const fit = cameraPresetPose(
    request.preset,
    framingBounds,
    cameraViewport(view.camera, view.size),
  )
  return withDepthRangeOf(fit, bounds)
}

// Snaps the live camera to a preset whenever a new request arrives. It reads the
// latest boxes, doorway, size, and camera from a ref so the effect fires only on a
// new request, not on a resize (a resize must not yank the camera onto a preset).
export function PresetCamera({
  request,
  boxes,
  doorway,
  onApplied,
}: {
  request: PresetRequest | null
  boxes: FramingBoxes
  doorway: DoorwayStand | null
  onApplied: (pose: CameraPose) => void
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const latest = useRef<PresetView>({ camera, size, boxes, doorway })
  latest.current = { camera, size, boxes, doorway }
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
