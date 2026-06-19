import type { Vector3 } from './vector3'

/** Eye height above the floor datum, in millimeters. */
export const WALK_EYE_HEIGHT_MM = 1700

/** Walking speed, in millimeters per second. */
export const WALK_SPEED_MM_PER_S = 3000

/** Small angular margin that keeps the pitch limit shy of straight up or down. */
const PITCH_LIMIT_EPSILON_RAD = 0.01

/** Pitch limit, just shy of straight up or down to avoid a degenerate view. */
export const MAX_WALK_PITCH_RAD = Math.PI / 2 - PITCH_LIMIT_EPSILON_RAD

/** How far ahead of the eye the look target sits, in millimeters. */
export const WALK_LOOK_DISTANCE_MM = 1000

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
 * diagonal covers the same total distance as a single key. Yaw advances by the
 * input yaw delta, and pitch advances by the input pitch delta clamped to
 * +/-MAX_WALK_PITCH_RAD. Returns a new state and never mutates the input.
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

  const pitch = state.pitch + input.pitchDelta
  const clampedPitch = Math.max(-MAX_WALK_PITCH_RAD, Math.min(MAX_WALK_PITCH_RAD, pitch))

  return {
    position: { x: nextX, y: state.position.y, z: nextZ },
    yaw: state.yaw + input.yawDelta,
    pitch: clampedPitch,
  }
}

/** Yaw and pitch deltas produced from a single pointer-look move. */
export interface PointerLookDelta {
  yawDelta: number
  pitchDelta: number
}

/**
 * Maps a pointer-look move to yaw and pitch deltas, in radians. A rightward
 * pointer move (positive movementX) yaws the view to the right (positive yaw),
 * and a downward pointer move (positive movementY, screen-y grows downward)
 * lowers the view (negative pitch). Both deltas scale with the sensitivity in
 * radians per pixel.
 */
export function pointerLookDelta(
  movementX: number,
  movementY: number,
  sensitivityRadPerPx: number,
): PointerLookDelta {
  return {
    yawDelta: movementX * sensitivityRadPerPx,
    pitchDelta: -movementY * sensitivityRadPerPx,
  }
}

/**
 * Accumulates a single pointer-look move onto the walk input, returning a new
 * WalkInput whose yaw and pitch deltas are the input's existing values plus the
 * pointer-look deltas. The sign rule lives entirely in pointerLookDelta, so a
 * rightward pointer move yaws the view right and a downward move lowers it.
 * Never mutates the input.
 */
export function accumulatePointerLook(
  input: WalkInput,
  movementX: number,
  movementY: number,
  sensitivityRadPerPx: number,
): WalkInput {
  const step = pointerLookDelta(movementX, movementY, sensitivityRadPerPx)
  return {
    ...input,
    yawDelta: input.yawDelta + step.yawDelta,
    pitchDelta: input.pitchDelta + step.pitchDelta,
  }
}

/**
 * Returns the point the walker is looking at, one look-distance ahead of the
 * eye. yaw 0 faces -Z and a positive pitch raises the view toward +Y, so the
 * look direction is (sin yaw cos pitch, sin pitch, -cos yaw cos pitch). The
 * direction is scaled by WALK_LOOK_DISTANCE_MM and added to the eye position.
 */
export function walkLookTarget(state: WalkState): Vector3 {
  const cosPitch = Math.cos(state.pitch)
  const directionX = Math.sin(state.yaw) * cosPitch
  const directionY = Math.sin(state.pitch)
  const directionZ = -Math.cos(state.yaw) * cosPitch

  return {
    x: state.position.x + directionX * WALK_LOOK_DISTANCE_MM,
    y: state.position.y + directionY * WALK_LOOK_DISTANCE_MM,
    z: state.position.z + directionZ * WALK_LOOK_DISTANCE_MM,
  }
}
