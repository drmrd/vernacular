import { describe, expect, it } from 'vitest'

import {
  emptyOpeningInteraction,
  WALK_EYE_HEIGHT_MM,
  type SceneGraph,
  type WalkState,
} from '../../core'

import { emptySceneGraph } from '../../core/scene/scene-graph-test-fixtures'
import {
  emptyWalkInput,
  resumedWalkState,
  seedWalkState,
  stepWalkFrame,
  walkFloorElevationMm,
  type WalkCamera,
  type WalkFrameContext,
} from './walk-session'

// The default floor-to-floor height puts the second floor 3000mm above the ground-floor datum.
const UPPER_FLOOR_ELEVATION_MM = 3000

// A pose a walker left behind mid-tour: off the origin, turned away from the
// default -Z heading, and looking slightly down.
const SAVED_WALK_POSE: WalkState = {
  position: { x: 1200, y: UPPER_FLOOR_ELEVATION_MM + WALK_EYE_HEIGHT_MM, z: -800 },
  yaw: 1.25,
  pitch: -0.4,
}

// The same pose with the eye on the ground floor, where the walk began.
const POSE_ON_GROUND_FLOOR: WalkState = {
  ...SAVED_WALK_POSE,
  position: { ...SAVED_WALK_POSE.position, y: WALK_EYE_HEIGHT_MM },
}

// A minimal WalkCamera-shaped stand-in: an identity world matrix (so the camera
// faces the default -Z heading) at the world origin. seedWalkState reads only the
// camera's world-matrix forward axis and its horizontal (x, z) position, never its
// y, so this stub carries no real eye height of its own.
function stubCamera() {
  return {
    position: { x: 0, y: 0, z: 0, set: () => {} },
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
    updateWorldMatrix: () => {},
    lookAt: () => {},
  }
}

describe('walk session: eye height seeding', () => {
  it("seeds the walk pose's eye height on the active floor's elevation, not the ground-floor datum", () => {
    // An upper floor sitting 3000mm above the ground-floor datum: entering walk
    // mode there must stand the eye on that floor's slab, not below it.
    const seeded = seedWalkState(
      stubCamera() as unknown as Parameters<typeof seedWalkState>[0],
      UPPER_FLOOR_ELEVATION_MM,
    )

    expect(seeded.position.y).toBe(UPPER_FLOOR_ELEVATION_MM + WALK_EYE_HEIGHT_MM)
  })
})

describe('walk session: floor elevation derivation', () => {
  it("derives the walk floor elevation from the active floor's scene-graph node", () => {
    // A scene graph narrowed to the active (upper) floor carries that floor's
    // own node, elevation and all: the walk pose must stand on that number,
    // not on a hardcoded ground-floor datum.
    const graph: SceneGraph = {
      ...emptySceneGraph(),
      nodes: [
        { id: 'floor:upper', kind: 'floor', name: 'Upper', elevation: UPPER_FLOOR_ELEVATION_MM },
      ],
    }

    expect(walkFloorElevationMm(graph)).toBe(UPPER_FLOOR_ELEVATION_MM)
  })
})

describe('resumedWalkState', () => {
  it('resumes the pose the walker left behind, wherever the camera happens to sit now', () => {
    // Re-entering walk mode after a view switch or an orbit detour hands back the
    // pose the walk left off on, so the tour picks up where the walker stopped.
    const camera = stubCamera() as unknown as Parameters<typeof seedWalkState>[0]

    const resumed = resumedWalkState(SAVED_WALK_POSE, camera, UPPER_FLOOR_ELEVATION_MM)

    expect(resumed).toEqual(SAVED_WALK_POSE)
  })

  it('seeds the pose from the camera when no walk pose has been left behind', () => {
    // A first entry into walk mode has nothing to resume, so the pose still comes
    // from where the camera is already looking.
    const camera = stubCamera() as unknown as Parameters<typeof seedWalkState>[0]

    const resumed = resumedWalkState(null, camera, UPPER_FLOOR_ELEVATION_MM)

    expect(resumed).toEqual(seedWalkState(camera, UPPER_FLOOR_ELEVATION_MM))
  })

  it('resumes a pose left on another floor at the same plan position and heading, with the eye on the active floor', () => {
    // The walker left the ground floor, and the upper floor is active when the walk resumes.
    const camera = stubCamera() as unknown as Parameters<typeof seedWalkState>[0]

    const resumed = resumedWalkState(POSE_ON_GROUND_FLOOR, camera, UPPER_FLOOR_ELEVATION_MM)

    expect(resumed).toEqual(SAVED_WALK_POSE)
    expect(POSE_ON_GROUND_FLOOR.position.y).toBe(WALK_EYE_HEIGHT_MM)
  })
})

// A walker's radius, wide enough to matter and with no wall in reach in these steps.
const WALK_RADIUS_MM = 250
// One frame of a 60 Hz display, in seconds.
const ONE_FRAME_SECONDS = 1 / 60

// A walk frame on a floor at the given elevation, with no key held and nothing to collide with,
// so the step can change the walker's height and nothing else. The walker starts from a copy of
// the pose, so the fixtures stay as they are. The camera stand-in keeps the
// last position it was driven to.
function stepContextOnFloor(pose: WalkState, floorElevationMm: number) {
  const position = {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      Object.assign(position, { x, y, z })
    },
  }
  const camera: WalkCamera = { ...stubCamera(), position }
  const state = { current: structuredClone(pose) }
  const context: WalkFrameContext = {
    camera,
    state,
    input: { current: emptyWalkInput() },
    openings: { current: [] },
    interaction: { current: emptyOpeningInteraction() },
    openness: { current: new Map<string, number>() },
    collisionInputs: {
      walls: [],
      openings: [],
      furnitureSegments: [],
      radius: WALK_RADIUS_MM,
      floorElevationMm,
    },
  }
  return { context, state, cameraPosition: position }
}

describe('walk session: the walker follows the active floor', () => {
  it('stands the eye on the active floor at the next walk step when the floor changes under the walker, at the same plan position and heading', () => {
    const { context, state, cameraPosition } = stepContextOnFloor(
      POSE_ON_GROUND_FLOOR,
      UPPER_FLOOR_ELEVATION_MM,
    )

    stepWalkFrame(context, ONE_FRAME_SECONDS)

    const eyeOnUpperFloor = UPPER_FLOOR_ELEVATION_MM + WALK_EYE_HEIGHT_MM
    expect(state.current.position.y).toBe(eyeOnUpperFloor)
    expect(cameraPosition.y).toBe(eyeOnUpperFloor)
    expect(state.current.position.x).toBe(SAVED_WALK_POSE.position.x)
    expect(state.current.position.z).toBe(SAVED_WALK_POSE.position.z)
    expect(state.current.yaw).toBe(SAVED_WALK_POSE.yaw)
    expect(state.current.pitch).toBe(SAVED_WALK_POSE.pitch)
  })

  it("returns the eye to the ground floor's eye height at the next walk step when the ground floor becomes active again", () => {
    const { context, state, cameraPosition } = stepContextOnFloor(SAVED_WALK_POSE, 0)

    stepWalkFrame(context, ONE_FRAME_SECONDS)

    expect(state.current.position.y).toBe(WALK_EYE_HEIGHT_MM)
    expect(cameraPosition.y).toBe(WALK_EYE_HEIGHT_MM)
  })
})
