import * as THREE from 'three'

import { entityIdOf } from './entity-id'

export interface EntityScreenPosition {
  id: string
  x: number
  y: number
}

interface EntityBoxes {
  boxes: Map<string, THREE.Box3>
  order: string[]
}

function mergeEntityBoxes(root: THREE.Object3D): EntityBoxes {
  const boxes = new Map<string, THREE.Box3>()
  const order: string[] = []
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    const id = entityIdOf(object)
    if (id === null) {
      return
    }
    const meshBox = new THREE.Box3().setFromObject(object)
    const existing = boxes.get(id)
    if (existing === undefined) {
      boxes.set(id, meshBox)
      order.push(id)
    } else {
      existing.union(meshBox)
    }
  })
  return { boxes, order }
}

function projectCenter(
  center: THREE.Vector3,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
): { x: number; y: number } | null {
  // View-space z is negative in front of the camera (it looks down -Z); skip anything behind.
  if (center.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) {
    return null
  }
  const ndc = center.clone().project(camera)
  const x = ((ndc.x + 1) / 2) * viewport.width
  const y = ((1 - ndc.y) / 2) * viewport.height
  if (x < 0 || x > viewport.width || y < 0 || y > viewport.height) {
    return null
  }
  return { x, y }
}

/** Projects each distinct entity's world bounding-box centre to viewport pixels through
 *  the camera, keeping only entities in front of the camera and within the viewport. The
 *  caller must have updated the camera's world matrix (the live R3F camera always is). */
export function entityScreenPositions(
  root: THREE.Object3D,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
): EntityScreenPosition[] {
  root.updateMatrixWorld(true)
  const { boxes, order } = mergeEntityBoxes(root)

  const positions: EntityScreenPosition[] = []
  const center = new THREE.Vector3()
  for (const id of order) {
    const box = boxes.get(id)
    if (box === undefined) {
      continue
    }
    box.getCenter(center)
    const projected = projectCenter(center, camera, viewport)
    if (projected === null) {
      continue
    }
    positions.push({ id, x: projected.x, y: projected.y })
  }
  return positions
}
