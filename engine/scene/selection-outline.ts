import * as THREE from 'three'

import { entityIdOf } from './entity-id'

/** A high-luminance outline that reads by contrast, not hue (color-blind-safe), drawn
 *  over the scene so a selected entity is visible even when occluded. */
const OUTLINE_COLOR = 0xffffff

/** The group that holds the selection outline, added once to the persistent scene. */
export function createSelectionOutlineGroup(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'selection-outline'
  return group
}

/** Rebuilds the outline overlay so it traces exactly the meshes whose entity id is
 *  selected. The base meshes and their shared materials are never touched, and the
 *  overlay is rebuilt from the current geometry, so it survives a scene rebuild. */
export function reconcileSelectionOutline(
  root: THREE.Object3D,
  selectedIds: ReadonlySet<string>,
  group: THREE.Group,
): void {
  for (const child of group.children) {
    if (child instanceof THREE.LineSegments) {
      child.geometry.dispose()
    }
  }
  group.clear()
  if (selectedIds.size === 0) {
    return
  }
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    const id = entityIdOf(object)
    if (id === null || !selectedIds.has(id)) {
      return
    }
    const edges = new THREE.EdgesGeometry(object.geometry)
    const material = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, depthTest: false })
    const line = new THREE.LineSegments(edges, material)
    line.renderOrder = 1
    line.applyMatrix4(object.matrixWorld)
    group.add(line)
  })
}
