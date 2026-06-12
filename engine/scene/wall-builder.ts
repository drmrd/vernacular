import * as THREE from 'three'

import { wallHeight, type WallSceneNode } from '../../core'
import type { MaterialProvider } from '../materials/material-provider'

/**
 * Builds the solid box mesh for one wall, in the pinned world-space convention
 * (ADR-0045): plan x maps to world X, plan y maps to world Z, and the vertical
 * axis is world Y. The box spans the wall's length along its direction, rises
 * from world Y = 0 to its height, and is centered across the centerline by half
 * its thickness. A single neutral material covers the shell for now; per-surface
 * material groups arrive in the next cycle.
 */
export function buildWallMesh(node: WallSceneNode, materials: MaterialProvider): THREE.Mesh {
  const length = Math.hypot(node.end.x - node.start.x, node.end.y - node.start.y)
  const height = wallHeight(node)
  const geometry = new THREE.BoxGeometry(length, height, node.thickness)
  const mesh = new THREE.Mesh(geometry, materials.material('interiorFace'))
  const midX = (node.start.x + node.end.x) / 2
  const midPlanY = (node.start.y + node.end.y) / 2
  // BoxGeometry centers its height at the origin, so raise the mesh by half its
  // height to land the base on the floor datum (Y = 0).
  mesh.position.set(midX, height / 2, midPlanY)
  // Negate the plan-y delta: plan y is down-positive, while it maps to the
  // right-handed world Z, so the wall's heading flips sense in world space.
  mesh.rotation.y = Math.atan2(-(node.end.y - node.start.y), node.end.x - node.start.x)
  mesh.userData.entityId = node.id
  return mesh
}
