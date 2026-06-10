import type { Point } from '../model/types'
import { planToWorld } from './plan-to-world'
import type { Vector3 } from './vector3'

/** Shoelace signed area in the plan frame. Positive and negative encode the
 *  two orientations; the absolute value is the polygon area. */
export function signedArea(loop: Point[]): number {
  let sum = 0
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i] as Point
    const b = loop[(i + 1) % loop.length] as Point
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Newell's-method normal of the loop after mapping it to world space at
 *  `height`. For a horizontal floor loop this is +/- world Y. */
export function loopWorldNormal(loop: Point[], height: number): Vector3 {
  const world = loop.map((p) => planToWorld(p, height))
  const normal: Vector3 = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < world.length; i += 1) {
    const a = world[i] as Vector3
    const b = world[(i + 1) % world.length] as Vector3
    normal.x += (a.y - b.y) * (a.z + b.z)
    normal.y += (a.z - b.z) * (a.x + b.x)
    normal.z += (a.x - b.x) * (a.y + b.y)
  }
  return normal
}

/** The canonical outward winding for a floor or face outer loop: oriented so
 *  its world normal points up (+Y) after planToWorld (foundation spec 2.1). */
export function canonicalOuterLoop(loop: Point[]): Point[] {
  return loopWorldNormal(loop, 0).y >= 0 ? loop : [...loop].reverse()
}

/** A hole is wound opposite the canonical outer loop, matching THREE.Shape
 *  hole expectations (foundation spec 3.2). */
export function canonicalHoleLoop(loop: Point[]): Point[] {
  return [...canonicalOuterLoop(loop)].reverse()
}
