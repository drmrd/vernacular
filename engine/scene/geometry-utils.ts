/** Three position components (x, y, z) per vertex of a non-indexed geometry. */
export const COMPONENTS_PER_VERTEX = 3

/** A triangle as three vertex indices into a point list. */
export type Triangle = [number, number, number]

/** Reverses each triangle's vertex order, flipping the face direction. */
export function reverseTriangleWinding(triangles: Triangle[]): Triangle[] {
  return triangles.map((triangle) => [...triangle].reverse() as Triangle)
}
