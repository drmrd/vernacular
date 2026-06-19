import { describe, it, expect } from 'vitest'
import type { Vector3 } from './vector3'
import {
  accumulatePointerLook,
  advanceWalk,
  MAX_WALK_PITCH_RAD,
  pointerLookDelta,
  WALK_EYE_HEIGHT_MM,
  WALK_LOOK_DISTANCE_MM,
  WALK_SPEED_MM_PER_S,
  walkLookTarget,
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

describe('advanceWalk look', () => {
  const noTime = 0

  it('clamps short of straight up and down so the camera never flips over', () => {
    expect(MAX_WALK_PITCH_RAD).toBeLessThan(Math.PI / 2)
  })

  it('adds the yaw delta to the current heading', () => {
    const next = advanceWalk(facingNegativeZ, { ...noInput, yawDelta: 0.5 }, noTime)

    expect(next.yaw).toBeCloseTo(0.5, 5)
  })

  it('adds the pitch delta within the allowed range', () => {
    const next = advanceWalk(facingNegativeZ, { ...noInput, pitchDelta: 0.5 }, noTime)

    expect(next.pitch).toBeCloseTo(0.5, 5)
  })

  it('clamps pitch to the upward limit when looking too far up', () => {
    const next = advanceWalk(facingNegativeZ, { ...noInput, pitchDelta: 10 }, noTime)

    expect(next.pitch).toBeCloseTo(MAX_WALK_PITCH_RAD, 5)
  })

  it('clamps pitch to the downward limit when looking too far down', () => {
    const next = advanceWalk(facingNegativeZ, { ...noInput, pitchDelta: -10 }, noTime)

    expect(next.pitch).toBeCloseTo(-MAX_WALK_PITCH_RAD, 5)
  })
})

describe('pointerLookDelta', () => {
  const sensitivity = 0.002

  it('yaws the view toward the pointer: rightward pointer move yields a positive yaw turning the view toward +X', () => {
    const rightwardMovementX = 40

    const { yawDelta } = pointerLookDelta(rightwardMovementX, 0, sensitivity)

    // A rightward pointer move must produce a positive yaw delta, scaled by sensitivity.
    expect(yawDelta).toBeGreaterThan(0)
    expect(yawDelta).toBeCloseTo(rightwardMovementX * sensitivity, 5)

    // Fed through advanceWalk from a yaw-0 state, the look target moves toward +X (screen-right).
    const turned = advanceWalk(facingNegativeZ, { ...noInput, yawDelta }, 0)
    const target = walkLookTarget(turned)
    expect(target.x).toBeGreaterThan(facingNegativeZ.position.x)

    // Symmetrically, a leftward pointer move turns the view toward -X (left).
    const { yawDelta: leftYaw } = pointerLookDelta(-rightwardMovementX, 0, sensitivity)
    expect(leftYaw).toBeLessThan(0)
    expect(leftYaw).toBeCloseTo(-rightwardMovementX * sensitivity, 5)
  })
})

describe('accumulatePointerLook', () => {
  const sensitivity = 0.002

  it('adds the pointer-look deltas onto the input with signs matching pointer direction', () => {
    const rightwardMovementX = 40
    const downwardMovementY = 25

    const accumulated = accumulatePointerLook(
      noInput,
      rightwardMovementX,
      downwardMovementY,
      sensitivity,
    )

    // A rightward pointer move turns the view right (positive yaw); a downward
    // pointer move lowers the view (negative pitch). Signs stay consistent with
    // pointerLookDelta rather than the bridge's old inverted accumulation.
    const expected = pointerLookDelta(rightwardMovementX, downwardMovementY, sensitivity)
    expect(accumulated.yawDelta).toBeGreaterThan(0)
    expect(accumulated.pitchDelta).toBeLessThan(0)
    expect(accumulated.yawDelta).toBeCloseTo(expected.yawDelta, 5)
    expect(accumulated.pitchDelta).toBeCloseTo(expected.pitchDelta, 5)
  })

  it('adds to a pre-existing nonzero yaw and pitch delta rather than replacing it', () => {
    const seededInput: WalkInput = { ...noInput, yawDelta: 0.1, pitchDelta: -0.05 }
    const movementX = 30
    const movementY = 18

    const accumulated = accumulatePointerLook(seededInput, movementX, movementY, sensitivity)

    const step = pointerLookDelta(movementX, movementY, sensitivity)
    expect(accumulated.yawDelta).toBeCloseTo(seededInput.yawDelta + step.yawDelta, 5)
    expect(accumulated.pitchDelta).toBeCloseTo(seededInput.pitchDelta + step.pitchDelta, 5)
  })

  it('scales the accumulated magnitude with sensitivity', () => {
    const movementX = 30
    const movementY = 18

    const low = accumulatePointerLook(noInput, movementX, movementY, sensitivity)
    const high = accumulatePointerLook(noInput, movementX, movementY, sensitivity * 3)

    expect(high.yawDelta).toBeCloseTo(low.yawDelta * 3, 5)
    expect(high.pitchDelta).toBeCloseTo(low.pitchDelta * 3, 5)
  })
})

describe('walkLookTarget', () => {
  it('looks one look-distance straight ahead down -Z at rest', () => {
    const target = walkLookTarget(facingNegativeZ)

    expect(target.x).toBeCloseTo(facingNegativeZ.position.x, 5)
    expect(target.y).toBeCloseTo(facingNegativeZ.position.y, 5)
    expect(target.z).toBeCloseTo(facingNegativeZ.position.z - WALK_LOOK_DISTANCE_MM, 5)
  })

  it('raises the look target above eye height when pitched up', () => {
    const lookingUp: WalkState = { ...facingNegativeZ, pitch: 0.3 }

    const target = walkLookTarget(lookingUp)

    expect(target.y).toBeGreaterThan(lookingUp.position.y)
  })

  it('looks one look-distance toward +X when yawed a quarter turn', () => {
    const yawedRight: WalkState = { ...facingNegativeZ, yaw: Math.PI / 2 }

    const target = walkLookTarget(yawedRight)

    expect(target.x).toBeCloseTo(yawedRight.position.x + WALK_LOOK_DISTANCE_MM, 5)
    expect(target.z).toBeCloseTo(yawedRight.position.z, 5)
  })
})
