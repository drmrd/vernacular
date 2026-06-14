import * as THREE from 'three'

import type { SurfaceRef } from '../../core'
import type { SurfaceRole } from '../materials/material-provider'

/** Three position components (x, y, z) per vertex of a non-indexed geometry. */
export const COMPONENTS_PER_VERTEX = 3

/** A triangle as three vertex indices into a point list. */
export type Triangle = [number, number, number]

/** Reverses each triangle's vertex order, flipping the face direction. */
export function reverseTriangleWinding(triangles: Triangle[]): Triangle[] {
  return triangles.map((triangle) => [...triangle].reverse() as Triangle)
}

/** A quad's four world corners, ordered around its perimeter. */
export type QuadCorners = [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]

/**
 * The two-triangle quad as a flat position array, from four world corners ordered
 * around the perimeter: triangles `a-b-c` and `a-c-d`, sharing the `a-c` diagonal.
 * The corner order the caller passes sets the winding (and so the face normal).
 */
export function thicknessSpanningQuad(corners: QuadCorners): number[] {
  const [a, b, c, d] = corners
  return [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z]
}

/** One contiguous geometry section: the surface role it draws, its world positions,
 *  and an optional paint surface ref (set for the two long faces). */
export interface WallSection {
  role: SurfaceRole
  positions: number[]
  ref?: SurfaceRef
}

/** A non-indexed buffer geometry with one material group per wall section. */
export function geometryFromSections(sections: WallSection[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const positions = sections.flatMap((section) => section.positions)
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, COMPONENTS_PER_VERTEX),
  )
  let runningStart = 0
  sections.forEach((section, materialIndex) => {
    const vertexCount = section.positions.length / COMPONENTS_PER_VERTEX
    geometry.addGroup(runningStart, vertexCount, materialIndex)
    runningStart += vertexCount
  })
  geometry.computeVertexNormals()
  return geometry
}
