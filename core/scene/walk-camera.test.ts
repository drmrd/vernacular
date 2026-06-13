import { describe, it, expect } from 'vitest'
import type { Vector3 } from './vector3'
import {
  advanceWalk,
  WALK_EYE_HEIGHT_MM,
  WALK_SPEED_MM_PER_S,
  type WalkInput,
  type WalkState,
} from './walk-camera'

const facingNegativeZ: WalkState = {
  position: { x: 0, y: WALK_EYE_HEIGHT_MM, z: 0 },
  yaw: 0,
  pitch: 0,
}

const noInput: WalkInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
  yawDelta: 0,
  pitchDelta: 0,
}

describe('advanceWalk horizontal movement at yaw 0', () => {
  it('moves on the horizontal plane relative to heading without drifting off eye height', () => {
    const oneSecond = 1
    const step = WALK_SPEED_MM_PER_S * oneSecond
    const diagonalComponent = step / Math.SQRT2

    const forward = advanceWalk(facingNegativeZ, { ...noInput, forward: true }, oneSecond)
    const right = advanceWalk(facingNegativeZ, { ...noInput, right: true }, oneSecond)
    const back = advanceWalk(facingNegativeZ, { ...noInput, back: true }, oneSecond)
    const left = advanceWalk(facingNegativeZ, { ...noInput, left: true }, oneSecond)
    const forwardRight = advanceWalk(
      facingNegativeZ,
      { ...noInput, forward: true, right: true },
      oneSecond,
    )

    const horizontalDistance = (from: Vector3, to: Vector3): number =>
      Math.hypot(to.x - from.x, to.z - from.z)

    // Forward (yaw 0 faces -Z): -Z by the full step, x unchanged.
    expect(forward.position.x).toBeCloseTo(0, 5)
    expect(forward.position.z).toBeCloseTo(-step, 5)

    // Right strafes +X, z unchanged; left strafes -X.
    expect(right.position.x).toBeCloseTo(step, 5)
    expect(right.position.z).toBeCloseTo(0, 5)
    expect(left.position.x).toBeCloseTo(-step, 5)
    expect(left.position.z).toBeCloseTo(0, 5)

    // Back moves +Z.
    expect(back.position.x).toBeCloseTo(0, 5)
    expect(back.position.z).toBeCloseTo(step, 5)

    // Every move stays pinned to eye height, including the diagonal.
    expect(forward.position.y).toBeCloseTo(WALK_EYE_HEIGHT_MM, 5)
    expect(right.position.y).toBeCloseTo(WALK_EYE_HEIGHT_MM, 5)
    expect(back.position.y).toBeCloseTo(WALK_EYE_HEIGHT_MM, 5)
    expect(left.position.y).toBeCloseTo(WALK_EYE_HEIGHT_MM, 5)
    expect(forwardRight.position.y).toBeCloseTo(WALK_EYE_HEIGHT_MM, 5)

    // Diagonal input is normalized: total horizontal distance equals one step,
    // split evenly between -Z (forward) and +X (right), not the full step on each axis.
    expect(horizontalDistance(facingNegativeZ.position, forwardRight.position)).toBeCloseTo(step, 5)
    expect(forwardRight.position.x).toBeCloseTo(diagonalComponent, 5)
    expect(forwardRight.position.z).toBeCloseTo(-diagonalComponent, 5)
  })
})
