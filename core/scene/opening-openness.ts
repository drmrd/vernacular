/**
 * How fast an opening swings, in openness units per second. Openness runs from 0
 * (shut) to 1 (fully open), so this rate opens or closes a leaf in a quarter
 * second, brisk enough to feel responsive without snapping.
 */
export const OPENNESS_RATE_PER_S = 4

/**
 * Advances an opening's openness one timestep toward its target (0 shut, 1 open)
 * at {@link OPENNESS_RATE_PER_S}, clamped so it lands exactly on the target
 * without overshooting. Returns the new openness and never reads any other state.
 */
export function advanceOpenness(current: number, target: number, dtSeconds: number): number {
  const step = OPENNESS_RATE_PER_S * dtSeconds
  if (target > current) {
    return Math.min(target, current + step)
  }
  return Math.max(target, current - step)
}
