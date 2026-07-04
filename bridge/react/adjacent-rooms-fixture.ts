import {
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
  deriveSceneGraph,
  type CameraPose,
  type Point,
  type Project,
  type SceneGraph,
  type Wall,
} from '../../core'

// Two adjacent rooms sharing one interior wall, built through the real derive
// pipeline (deriveSceneGraph -> deriveRooms) rather than hand-authored room
// polygons, so the rendered slabs reflect the centerline-stop rule (ADR-0129) and
// the slab side-face inset (ADR-0150) exactly as production derives them. The
// hand-authored harness fixtures bake their room nodes and so would not exercise
// either fix; this fixture does (issue #402).

/** A period plaster partition thickness, thick enough that the shared wall reads clearly. */
const WALL_THICKNESS_MM = 200
/** Plan depth of the building (the shared wall runs this far). */
const ROOM_DEPTH_MM = 3000
/** Plan width of each of the two rooms; the shared wall sits at this x. */
const ROOM_WIDTH_MM = 4000
/** The shared wall centerline, where the two rooms' slab boundaries meet. */
const SHARED_WALL_X_MM = ROOM_WIDTH_MM
/** Plan width of the whole two-room building. */
const BUILDING_WIDTH_MM = ROOM_WIDTH_MM * 2
/** A nominal interior doorway width. */
const DOORWAY_WIDTH_MM = 900
/** The doorway centered along the shared wall, so the exposed slab edge is mid-span. */
const DOORWAY_CENTER_ALONG_MM = ROOM_DEPTH_MM / 2

/** The shared wall's model id, referenced by the doorway's host and asserted by the fixture test. */
const SHARED_WALL_ID = 'shared'
/** The single floor's model id, kept fixed so paint and pick targets stay deterministic. */
const FLOOR_ID = 'demo'

/** One partition-thickness wall with a fixed id, so the doorway host and every id stays deterministic. */
function partitionWall(id: string, start: Point, end: Point): Wall {
  return createWall(start, end, { id, thickness: WALL_THICKNESS_MM })
}

/**
 * The seven walls: a 8000 by 3000 mm outer rectangle split by a shared interior
 * wall at x = 4000. The two south and two north segments meet the shared wall at
 * its feet, so the wall graph derives two rooms that share that wall.
 */
function adjacentRoomWalls(): Wall[] {
  return [
    partitionWall('south-left', { x: 0, y: 0 }, { x: SHARED_WALL_X_MM, y: 0 }),
    partitionWall('south-right', { x: SHARED_WALL_X_MM, y: 0 }, { x: BUILDING_WIDTH_MM, y: 0 }),
    partitionWall(
      'east',
      { x: BUILDING_WIDTH_MM, y: 0 },
      { x: BUILDING_WIDTH_MM, y: ROOM_DEPTH_MM },
    ),
    partitionWall(
      'north-right',
      { x: BUILDING_WIDTH_MM, y: ROOM_DEPTH_MM },
      { x: SHARED_WALL_X_MM, y: ROOM_DEPTH_MM },
    ),
    partitionWall(
      'north-left',
      { x: SHARED_WALL_X_MM, y: ROOM_DEPTH_MM },
      { x: 0, y: ROOM_DEPTH_MM },
    ),
    partitionWall('west', { x: 0, y: ROOM_DEPTH_MM }, { x: 0, y: 0 }),
    partitionWall(
      SHARED_WALL_ID,
      { x: SHARED_WALL_X_MM, y: 0 },
      { x: SHARED_WALL_X_MM, y: ROOM_DEPTH_MM },
    ),
  ]
}

/** The fixture project: one floor of the seven walls with a doorway cut in the shared wall. */
function adjacentRoomsProject(): Project {
  const floor = {
    ...createFloor('Adjacent rooms', { id: FLOOR_ID, walls: adjacentRoomWalls() }),
    openings: [
      createOpening({
        id: 'shared-door',
        type: 'single-swing-door',
        hostWallId: SHARED_WALL_ID,
        position: DOORWAY_CENTER_ALONG_MM,
        width: DOORWAY_WIDTH_MM,
      }),
    ],
  }
  return {
    ...createEmptyProject({
      name: 'Adjacent rooms',
      units: 'metric',
      period: 'victorian',
      appVersion: 'harness',
    }),
    floors: [floor],
  }
}

/**
 * The derived scene graph for the two-adjacent-rooms harness state. Pure and
 * deterministic, so the fixture and its committed baseline are stable across runs.
 */
export function buildAdjacentRoomsFixture(): SceneGraph {
  return deriveSceneGraph(adjacentRoomsProject())
}

// The below-datum vantage that exposes the shared slab boundary. planToWorld maps
// plan (x, y) to world (x, height, -y), so the shared wall centerline is world
// x = 4000, the building spans world z in [-3000, 0], and the doorway centers on
// world z = -1500. The slab top sits at world y = 0 and its underside below that.
// The camera drops below the floor datum and looks up at the underside where the
// two rooms' slabs meet, the one place a static frame can witness this pair: from
// below, both rooms' downward-facing base caps are front facing and drawn, so if a
// regression reopens the ADR-0129 overlap the coincident caps z-fight in view. A
// standing camera would cull one side and hide the contest entirely (ADR-0150).

/** World x of the shared wall centerline (plan x = SHARED_WALL_X_MM). */
const SHARED_WALL_WORLD_X = SHARED_WALL_X_MM
/** World z at the doorway center (plan y = DOORWAY_CENTER_ALONG_MM maps to -y). */
const DOORWAY_WORLD_Z = -DOORWAY_CENTER_ALONG_MM
/** A point just under the slab underside, the look target on the shared boundary. */
const UNDERSIDE_TARGET_Y = -150
/** How far below the floor datum the camera drops, well under the slab underside. */
const CAMERA_DROP_Y = -3200
/** How far the camera pulls back along +z (out past the south wall) to see the whole underside. */
const CAMERA_PULL_Z = 4200
/** A small sideways offset so the underside reads in three-quarter rather than dead-on. */
const CAMERA_SIDE_X = 1600
/** Near plane: comfortably in front of the camera for this fixed-size scene. */
const CAMERA_NEAR_MM = 100
/** Far plane: past the far wall of this fixed-size scene. */
const CAMERA_FAR_MM = 40000

/** The canonical camera pose for the adjacent-rooms harness state (see the note above). */
export const ADJACENT_ROOMS_CAMERA_POSE: CameraPose = {
  position: {
    x: SHARED_WALL_WORLD_X - CAMERA_SIDE_X,
    y: CAMERA_DROP_Y,
    z: DOORWAY_WORLD_Z + CAMERA_PULL_Z,
  },
  target: { x: SHARED_WALL_WORLD_X, y: UNDERSIDE_TARGET_Y, z: DOORWAY_WORLD_Z },
  near: CAMERA_NEAR_MM,
  far: CAMERA_FAR_MM,
}
