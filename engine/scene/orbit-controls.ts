import type { Camera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { Vector3 } from '../../core'

/**
 * Camera-navigation facade over three's OrbitControls. It exposes only the plain
 * methods the bridge layer needs and accepts a core Vector3 target, so callers can
 * drive orbit/pan/zoom without importing three themselves (rules.md rule 1).
 */
export interface OrbitController {
  setTarget(target: Vector3): void
  setEnabled(enabled: boolean): void
  update(): void
  dispose(): void
}

/**
 * Builds an OrbitController bound to the given camera and DOM element, with rotate,
 * pan, and zoom enabled. The returned object hides the underlying three controls.
 */
export function createOrbitController(camera: Camera, domElement: HTMLElement): OrbitController {
  const controls = new OrbitControls(camera, domElement)
  controls.enableRotate = true
  controls.enablePan = true
  controls.enableZoom = true

  return {
    setTarget(target) {
      controls.target.set(target.x, target.y, target.z)
      controls.update()
    },
    setEnabled(enabled) {
      controls.enabled = enabled
    },
    update() {
      controls.update()
    },
    dispose() {
      controls.dispose()
    },
  }
}
