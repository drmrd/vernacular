import type { Vector3 } from './vector3'

/** Eye height above the floor datum, in millimeters. */
export const WALK_EYE_HEIGHT_MM = 1700

/** Walking speed, in millimeters per second. */
export const WALK_SPEED_MM_PER_S = 3000

/** Where the walker is and which way they look. yaw 0 faces -Z. */
export interface WalkState {
  position: Vector3
  yaw: number
  pitch: number
}

/** Per-frame walk intent: held movement keys and accumulated look deltas. */
export interface WalkInput {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  yawDelta: number
  pitchDelta: number
}

/** Returns 1 when the key is held, 0 otherwise, for axis blending. */
function axisSign(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0)
}

/**
 * Advances a walking camera by one timestep. Movement is constrained to the
 * horizontal (x, z) plane at the current eye height: yaw 0 faces -Z, so the
 * forward axis is (sin yaw, 0, -cos yaw) and the right axis is (cos yaw, 0,
 * sin yaw). The net direction is normalized and scaled by speed and dt, so a
 * diagonal covers the same total distance as a single key. Look (yaw, pitch) is
 * not yet updated by input; the deltas are accepted in the interface so callers
 * stay stable once look control is added. Returns a new state and never mutates
 * the input.
 */
export function advanceWalk(state: WalkState, input: WalkInput, dtSeconds: number): WalkState {
  const forwardScale = axisSign(input.forward, input.back)
  const rightScale = axisSign(input.right, input.left)
  const directionX = Math.sin(state.yaw) * forwardScale + Math.cos(state.yaw) * rightScale
  const directionZ = -Math.cos(state.yaw) * forwardScale + Math.sin(state.yaw) * rightScale
  const magnitude = Math.hypot(directionX, directionZ)

  let nextX = state.position.x
  let nextZ = state.position.z
  if (magnitude > 0) {
    const step = (WALK_SPEED_MM_PER_S * dtSeconds) / magnitude
    nextX += directionX * step
    nextZ += directionZ * step
  }

  return {
    position: { x: nextX, y: state.position.y, z: nextZ },
    yaw: state.yaw,
    pitch: state.pitch,
  }
}
