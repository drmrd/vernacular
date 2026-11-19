/**
 * What a first-person walk session is made of: the refs it advances, the live canvas it
 * drives, and the pure helpers that seed its pose and read its keyboard. The component
 * that mounts a session lives in walk-camera-controls.tsx; this module holds the parts
 * that carry no React runtime, so they can be read and tested on their own.
 */
import type { RefObject } from 'react'
import {
  emptyOpeningInteraction,
  WALK_EYE_HEIGHT_MM,
  type SceneGraph,
  type WalkInput,
  type WalkState,
} from '../../core'
import type { OpeningMotionRefs } from './use-opening-motion'
import { interactFromWalk } from './walk-interaction'

// Maps a keyboard code to the movement flag it drives. A Map keeps the lookup result
// `... | undefined`, so an unmapped key (anything but WASD) is ignored cleanly.
const MOVEMENT_KEYS = new Map<string, 'forward' | 'back' | 'left' | 'right'>([
  ['KeyW', 'forward'],
  ['KeyS', 'back'],
  ['KeyA', 'left'],
  ['KeyD', 'right'],
])

// The "use" key, the conventional first-person interact verb. It is read as a general
// interact action so other interactables (lights, drawers) can hook in here later.
const INTERACT_KEY = 'KeyE'

// The reset key: clears every opened opening so they animate shut.
const RESET_KEY = 'KeyR'

// The subset of the three camera a walk reads and writes, declared structurally so this
// module types the camera without importing three (rules.md rule 1).
export interface WalkCamera {
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
  matrixWorld: { elements: ArrayLike<number> }
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void
  lookAt(x: number, y: number, z: number): void
}

// Seeds a walk state from the camera's current eye-level position and heading so
// entering walk mode does not teleport the view. A camera looks down the negated
// third column of its world matrix; yaw and pitch come from that forward vector.
// The eye height is seeded on the active floor's elevation, not the ground-floor
// datum, so walking on an upper floor starts at that floor's eye level.
export function seedWalkState(camera: WalkCamera, floorElevationMm: number): WalkState {
  camera.updateWorldMatrix(true, false)
  const e = camera.matrixWorld.elements
  // The forward axis is elements [8, 9, 10] of the column-major matrixWorld (the
  // third column's XYZ), negated; default to facing -Z if any element is absent.
  const fx = e[8] ?? 0
  const fy = e[9] ?? 0
  const fz = e[10] ?? -1
  const length = Math.hypot(fx, fy, fz) || 1
  const forward = { x: -fx / length, y: -fy / length, z: -fz / length }
  return {
    position: {
      x: camera.position.x,
      y: floorElevationMm + WALK_EYE_HEIGHT_MM,
      z: camera.position.z,
    },
    yaw: Math.atan2(forward.x, -forward.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, forward.y))),
  }
}

// The same pose with the eye on the given floor: its elevation plus the walk eye height.
// The plan position, yaw and pitch stay; the input pose is never changed.
export function walkStateOnFloor(state: WalkState, floorElevationMm: number): WalkState {
  return {
    ...state,
    position: { ...state.position, y: floorElevationMm + WALK_EYE_HEIGHT_MM },
  }
}

// Resumes the pose the last walk session left behind, so a view-mode switch or a
// detour through orbit puts the walker back where they stood instead of wherever the
// camera happens to sit now (ADR-0170). The pose is seated on the active floor, which
// may differ from the floor it was left on. With no pose to resume, the camera seeds
// the walk the way it always has.
export function resumedWalkState(
  saved: WalkState | null,
  camera: WalkCamera,
  floorElevationMm: number,
): WalkState {
  return saved === null
    ? seedWalkState(camera, floorElevationMm)
    : walkStateOnFloor(saved, floorElevationMm)
}

// The active floor's elevation, read from its scene-graph node; 0 when no floor
// node is present.
export function walkFloorElevationMm(graph: SceneGraph): number {
  const floorNode = graph.nodes.find((node) => node.kind === 'floor')
  return floorNode?.elevation ?? 0
}

export function emptyWalkInput(): WalkInput {
  return { forward: false, back: false, left: false, right: false, yawDelta: 0, pitchDelta: 0 }
}

export function initialWalkState(floorElevationMm: number): WalkState {
  return {
    position: { x: 0, y: floorElevationMm + WALK_EYE_HEIGHT_MM, z: 0 },
    yaw: 0,
    pitch: 0,
  }
}

// The refs a walk advances: the walker's pose and held input, plus the opening refs
// useOpeningMotion owns. A session starts them and the frame loop steps the same refs. The
// list of shown openings stays with the frame tick, so a session does not take it.
export interface WalkRefs extends Omit<OpeningMotionRefs, 'shownOpenings'> {
  state: RefObject<WalkState>
  input: RefObject<WalkInput>
}

// What a walk session needs from the live canvas: the camera it drives, the element it
// captures the pointer on, and the elevation of the floor being walked.
export interface WalkSessionHost {
  camera: WalkCamera
  domElement: HTMLElement
  floorElevationMm: number
}

export interface WalkSession extends WalkRefs, WalkSessionHost {
  onUserControl: () => void
  /** The pose a previous session left behind, or null when nobody has walked yet. */
  savedWalkPose: WalkState | null
  /** Reports the pose the walker ended on, so the next session can resume it. */
  onWalkPose: (pose: WalkState) => void
  /** Reports which doors stand open, so the store and the other view follow the walker at once. */
  onOpenDoors: (openIds: ReadonlySet<string>) => void
}

// Builds the keydown and keyup handlers. Keydown routes the interact key to the
// opening under the walker's gaze and every other code to its movement flag;
// keyup clears the movement flag. The interact key takes no movement flag, so it
// never leaves a key stuck down. Both keys that change what stands open report the
// resulting door set, so a session that ends after them can be resumed.
export function walkKeyHandlers(session: WalkSession): {
  onKeyDown: (event: KeyboardEvent) => void
  onKeyUp: (event: KeyboardEvent) => void
} {
  const { state, input, openings, interaction, openness } = session
  const { onUserControl, onOpenDoors } = session
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === INTERACT_KEY) {
      // Pass the live openness so the ray reaches an opening at its swung or slid
      // position, letting the walker close a door that is already open.
      interaction.current = interactFromWalk(
        state.current,
        openings.current,
        interaction.current,
        openness.current,
      )
      onOpenDoors(interaction.current.openIds)
      onUserControl()
      return
    }
    if (event.code === RESET_KEY) {
      // The per-frame tick animates each opening shut from its current openness.
      interaction.current = emptyOpeningInteraction()
      onOpenDoors(interaction.current.openIds)
      onUserControl()
      return
    }
    const flag = MOVEMENT_KEYS.get(event.code)
    if (flag === undefined) return
    input.current[flag] = true
    onUserControl()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    const flag = MOVEMENT_KEYS.get(event.code)
    if (flag !== undefined) input.current[flag] = false
  }
  return { onKeyDown, onKeyUp }
}
