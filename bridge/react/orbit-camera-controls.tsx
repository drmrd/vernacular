import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Vector3 } from '../../core'
import { createOrbitController, type OrbitController } from '../../engine'

interface OrbitCameraControlsProps {
  enabled: boolean
  target: Vector3
  onUserControl: () => void
}

/**
 * Wires the engine orbit facade to the live camera and canvas so a drag orbits, a
 * secondary drag pans, and the wheel zooms. It holds the facade, not a three
 * OrbitControls instance, so this bridge file does not import three (rules.md rule
 * 1). It marks the camera as user-controlled on the first pointer press through a
 * listener it owns on the canvas, which is what tells the pane to stop reframing on
 * edits. This is rendering glue that only runs under a real canvas, so its behavior
 * is covered by the scene-webgl navigation end-to-end test rather than a unit test.
 */
export function OrbitCameraControls({ enabled, target, onUserControl }: OrbitCameraControlsProps) {
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const controllerRef = useRef<OrbitController | null>(null)

  // Construct exactly one controller for this camera and canvas, and mark the camera
  // as user-controlled the first time the user presses on it.
  useEffect(() => {
    const controller = createOrbitController(camera, domElement)
    controllerRef.current = controller
    const markControlled = () => onUserControl()
    domElement.addEventListener('pointerdown', markControlled)
    return () => {
      domElement.removeEventListener('pointerdown', markControlled)
      controller.dispose()
      controllerRef.current = null
    }
  }, [camera, domElement, onUserControl])

  // Keep the orbit target on the framed pose's target so orbiting turns around the
  // building rather than the world origin.
  useEffect(() => {
    controllerRef.current?.setTarget(target)
  }, [target])

  // Park the orbit controls while walk mode drives the camera.
  useEffect(() => {
    controllerRef.current?.setEnabled(enabled)
  }, [enabled])

  return null
}
