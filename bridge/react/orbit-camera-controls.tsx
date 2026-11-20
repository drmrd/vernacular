import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Vector3 } from '../../core'
import { createOrbitController, type OrbitController } from '../../engine'
import type { SavedCamera } from '../scene-session/scene-session-store'
import { cameraPositionOf } from './scene-camera-seed'

interface OrbitCameraControlsProps {
  enabled: boolean
  /** The pivot the first controller starts on. Later builds in one mount start where the last one stopped. */
  initialTarget: Vector3
  /** A pivot to move to when it changes; null keeps the controller's own pivot. */
  target: Vector3 | null
  onUserControl: () => void
  onLeave: (camera: SavedCamera) => void
}

/**
 * Calls `notify` on a pointer press or a wheel turn on the canvas. Returns a function that
 * removes both listeners.
 */
function listenForUserControl(domElement: HTMLElement, notify: () => void): () => void {
  domElement.addEventListener('pointerdown', notify)
  domElement.addEventListener('wheel', notify, { passive: true })
  return () => {
    domElement.removeEventListener('pointerdown', notify)
    domElement.removeEventListener('wheel', notify)
  }
}

/**
 * Wires the engine orbit facade to the live camera and canvas so a drag orbits, a
 * secondary drag pans, and the wheel zooms. It holds the facade, not a three
 * OrbitControls instance, so this bridge file does not import three (rules.md rule
 * 1). The controller starts on `initialTarget`, so a remount can resume the pivot the
 * departing canvas turned around. It marks the camera as user-controlled on a pointer
 * press or a wheel turn through listeners it owns on the canvas, which is what tells the
 * pane to stop reframing on edits. On the way out it reports the camera position and the
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
  // Held in refs so a new identity of these props never rebuilds the controller.
  const callbacksRef = useRef({ onLeave, onUserControl })
  callbacksRef.current = { onLeave, onUserControl }
  const notifyUserControl = () => callbacksRef.current.onUserControl()
  // The next controller starts here; each cleanup stores the pivot it held.
  const startTargetRef = useRef(initialTarget)
  // The last pivot handed to the controller. It starts as the first target because the
  // construction already placed the pivot, and strict mode runs each effect twice on
  // mount, so comparing identity is what keeps the second run from moving the pivot.
  const appliedTargetRef = useRef(target)

  // Construct exactly one controller for this camera and canvas, and mark the camera
  // as user-controlled when the user presses on it or turns the wheel. The camera and
  // the pivot are read on the way out, before the controller is disposed of, so they are
  // still the ones the user was looking through.
  useEffect(() => {
    const controller = createOrbitController(camera, domElement)
    controller.setTarget(startTargetRef.current)
    controllerRef.current = controller
    const stopListening = listenForUserControl(domElement, notifyUserControl)
    return () => {
      stopListening()
      const pivot = controller.getTarget()
      startTargetRef.current = pivot
      callbacksRef.current.onLeave({ position: cameraPositionOf(camera), orbitTarget: pivot })
      controller.dispose()
      controllerRef.current = null
    }
  }, [camera, domElement])

  // Move the pivot only when the pane asks for a new one. Null keeps the controller's own
  // pivot, so a scene rebuild leaves a panned pivot alone; the null is still recorded, so
  // the same target object returning later is applied again.
  useEffect(() => {
    if (appliedTargetRef.current === target) return
    appliedTargetRef.current = target
    if (target !== null) controllerRef.current?.setTarget(target)
  }, [target])

  // Park the orbit controls while walk mode drives the camera.
  useEffect(() => {
    controllerRef.current?.setEnabled(enabled)
  }, [enabled])

  return null
}
