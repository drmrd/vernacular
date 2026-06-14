import * as THREE from 'three'

/**
 * A `LineSegments` tracing `geometry`'s edges (its outline and sharp creases, from
 * `EdgesGeometry`), drawn with `material`. Shared by the always-on edge overlay and
 * the selection outline so both build their lines the same way.
 */
export function edgeLines(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): THREE.LineSegments {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geometry), material)
}
