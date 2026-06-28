import type { Vector3 } from './vector3'
import { resolveWalkCollision, type PlanarPoint, type WalkCollisionWorld } from './walk-collision'

/** Eye height above the floor datum, in millimeters. */
export const WALK_EYE_HEIGHT_MM = 1600

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

/** Resolves the proposed horizontal move against the collision world, if any. */
function resolveMove(
  proposed: PlanarPoint,
  collision: WalkCollisionWorld | undefined,
): PlanarPoint {
  if (collision === undefined) {
    return proposed
  }
  return resolveWalkCollision(proposed, collision.segments, collision.radius)
}

/**
 * Advances a walking camera by one timestep. Movement is constrained to the
 * horizontal (x, z) plane at the current eye height: yaw 0 faces -Z, so the
 * forward axis is (sin yaw, 0, -cos yaw) and the right axis is (cos yaw, 0,
 * sin yaw). The net direction is normalized and scaled by speed and dt, so a
 * diagonal covers the same total distance as a single key. When a collision
 * world is supplied, the proposed horizontal move is clamped or slid so the
 * walker keeps clear of the walls, while the eye height (y) is left untouched.
 * Yaw advances by the input yaw delta, and pitch advances by the input pitch
 * delta clamped to +/-MAX_WALK_PITCH_RAD. Returns a new state and never mutates
 * the input.
 */
// eslint-disable-next-line max-params -- the optional collision world is an environmental input independent of the walk state, the per-frame intent, and the timestep; collapsing it into any of those would conflate distinct concerns.
export function advanceWalk(
  state: WalkState,
  input: WalkInput,
  dtSeconds: number,
  collision?: WalkCollisionWorld,
): WalkState {
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
  const moved = resolveMove({ x: nextX, z: nextZ }, collision)

  const pitch = state.pitch + input.pitchDelta
  const clampedPitch = Math.max(-MAX_WALK_PITCH_RAD, Math.min(MAX_WALK_PITCH_RAD, pitch))

  return {
    position: { x: moved.x, y: state.position.y, z: moved.z },
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
// eslint-disable-next-line max-params -- four physically-independent quantities: the walk input plus the two screen-axis deltas and the scale factor; none can be meaningfully collapsed, matching pointerLookDelta's arity.
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
 * The unit vector the walker looks along. yaw 0 faces -Z and a positive pitch
 * raises the view toward +Y, so the direction is (sin yaw cos pitch, sin pitch,
 * -cos yaw cos pitch). It is the seam an interaction ray casts from the eye.
 */
export function walkLookDirection(state: WalkState): Vector3 {
  const cosPitch = Math.cos(state.pitch)
  return {
    x: Math.sin(state.yaw) * cosPitch,
    y: Math.sin(state.pitch),
    z: -Math.cos(state.yaw) * cosPitch,
  }
}

/**
 * Returns the point the walker is looking at, one look-distance ahead of the
 * eye, along {@link walkLookDirection}.
 */
export function walkLookTarget(state: WalkState): Vector3 {
  const direction = walkLookDirection(state)
  return {
    x: state.position.x + direction.x * WALK_LOOK_DISTANCE_MM,
    y: state.position.y + direction.y * WALK_LOOK_DISTANCE_MM,
    z: state.position.z + direction.z * WALK_LOOK_DISTANCE_MM,
  }
}
