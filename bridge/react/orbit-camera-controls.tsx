import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Vector3 } from '../../core'
import { createOrbitController, type OrbitController } from '../../engine'
import type { SavedCamera } from '../scene-session/scene-session-store'
import { cameraPositionOf } from './scene-camera-seed'

interface OrbitCameraControlsProps {
  enabled: boolean
  /** The pivot the controller starts on. Read once, when the controller is built. */
  initialTarget: Vector3
  /** A pivot to move to when it changes. */
  target: Vector3
  onUserControl: () => void
  onLeave: (camera: SavedCamera) => void
}

/**
 * Wires the engine orbit facade to the live camera and canvas so a drag orbits, a
 * secondary drag pans, and the wheel zooms. It holds the facade, not a three
 * OrbitControls instance, so this bridge file does not import three (rules.md rule
 * 1). The controller starts on `initialTarget`, so a remount can resume the pivot the
 * departing canvas turned around. It marks the camera as user-controlled on the first
 * pointer press through a listener it owns on the canvas, which is what tells the pane
 * to stop reframing on edits. On the way out it reports the camera position and the
 * orbit pivot through onLeave, so a session that outlives this canvas can reopen the
 * next one looking where this one looked.
 */
export function OrbitCameraControls({
  enabled,
  initialTarget,
  target,
  onUserControl,
  onLeave,
}: OrbitCameraControlsProps) {
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const controllerRef = useRef<OrbitController | null>(null)
  // Held in refs so the identity of these props can never be a reason to tear the
  // controller down and build a new one.
  const onLeaveRef = useRef(onLeave)
  onLeaveRef.current = onLeave
  const initialTargetRef = useRef(initialTarget)
  // The last pivot handed to the controller. It starts as the first target because the
  // construction already placed the pivot, and strict mode runs each effect twice on
  // mount, so comparing identity is what keeps the second run from moving the pivot.
  const appliedTargetRef = useRef(target)

  // Construct exactly one controller for this camera and canvas, and mark the camera
  // as user-controlled the first time the user presses on it. The camera and the pivot
  // are read on the way out, before the controller is disposed of, so they are still the
  // ones the user was looking through.
  useEffect(() => {
    const controller = createOrbitController(camera, domElement)
    controller.setTarget(initialTargetRef.current)
    controllerRef.current = controller
    domElement.addEventListener('pointerdown', onUserControl)
    return () => {
      domElement.removeEventListener('pointerdown', onUserControl)
      onLeaveRef.current({
        position: cameraPositionOf(camera),
        orbitTarget: controller.getTarget(),
      })
      controller.dispose()
      controllerRef.current = null
    }
  }, [camera, domElement, onUserControl])

  // Move the pivot when the framed or preset target changes, so orbiting turns around
  // the building rather than the world origin.
  useEffect(() => {
    if (appliedTargetRef.current === target) return
    appliedTargetRef.current = target
    controllerRef.current?.setTarget(target)
  }, [target])

  // Park the orbit controls while walk mode drives the camera.
  useEffect(() => {
    controllerRef.current?.setEnabled(enabled)
  }, [enabled])

  return null
}
