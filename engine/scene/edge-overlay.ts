import * as THREE from 'three'

import { edgeLines } from './edge-lines'

/** The dark hidden-line color the surface edges draw in. */
export const EDGE_COLOR = 0x2b2b2b

/**
 * Adds a dark, depth-tested edge line along every mesh in a built scene, so the
 * surfaces read against each other whatever the lighting and paint are. Each line
 * is a child of its mesh, so it inherits the mesh transform, and it carries no
 * entity id and is a line rather than a mesh, so the hit-test, the accessibility
 * proxies, and the selection traversal (which all collect meshes by entity id)
 * ignore it. Depth testing is on, so the geometry in front hides the lines behind
 * it (a hidden-line look). One material is shared by every edge line.
 */
export function addEdgeOverlay(root: THREE.Object3D): void {
  const material = new THREE.LineBasicMaterial({ color: EDGE_COLOR })
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })
  for (const mesh of meshes) {
    mesh.add(edgeLines(mesh.geometry, material))
  }
}
