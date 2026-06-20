import type { Point } from '../../core'

export const CANDIDATE_STEP_MM = 100

/**
 * Move the candidate point by one grid step for an arrow key, returning null
 * for any other key. The motion is in world space (y increases upward),
 * matching the selection nudge, so ArrowUp adds to y and ArrowDown subtracts.
 *
 * @param step distance to move, usually `CANDIDATE_STEP_MM` so authoring and
 *   editing share one motion granularity with the selection nudge.
 */
export function nudgeCandidate(point: Point, key: string, step: number): Point | null {
  switch (key) {
    case 'ArrowUp':
      return { x: point.x, y: point.y + step }
    case 'ArrowDown':
      return { x: point.x, y: point.y - step }
    case 'ArrowLeft':
      return { x: point.x - step, y: point.y }
    case 'ArrowRight':
      return { x: point.x + step, y: point.y }
    default:
      return null
  }
}
