import type * as THREE from 'three'

import { distance, type Point } from '../../core'

/** The `userData` key under which a wall mesh records the stretch of its host wall it was built for. */
export const WALL_SPAN_KEY = 'wallSpanMm'

/** A stretch of a host wall, in mm along the wall from its start, `fromMm` < `toMm`. */
export interface WallSpan {
  fromMm: number
  toMm: number
}

/**
 * Records on `mesh`, under WALL_SPAN_KEY, the stretch of the host wall that starts at `hostStart`
 * between the ends of `edge`: their distances from `hostStart`, the smaller as `fromMm`.
 */
export function markWallSpan(
  mesh: THREE.Object3D,
  hostStart: Point,
  edge: { start: Point; end: Point },
): void {
  const startMm = distance(hostStart, edge.start)
  const endMm = distance(hostStart, edge.end)
  const span: WallSpan = { fromMm: Math.min(startMm, endMm), toMm: Math.max(startMm, endMm) }
  mesh.userData[WALL_SPAN_KEY] = span
}

/** The span recorded on `object`, or undefined when none is recorded. */
export function wallSpanOf(object: THREE.Object3D): WallSpan | undefined {
  return object.userData[WALL_SPAN_KEY] as WallSpan | undefined
}
