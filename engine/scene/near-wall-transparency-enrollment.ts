import type * as THREE from 'three'

import {
  exteriorWalls,
  junctionFadeGroups,
  withAttachedFurniture,
  type FurnitureSceneNode,
  type OpeningSceneNode,
  type RoomSceneNode,
  type WallSceneNode,
} from '../../core'

import { prepareNearWallTransparency, type NearWallTarget } from './near-wall-transparency'
import { buildFloorWallGraph } from './wall-scene-helpers'

/**
 * The scene nodes one assembled root's near-wall fade enrollment is derived from. A whole
 * `SceneGraph` and the reconciler's per-floor entity narrowing both satisfy it, so either
 * scene-assembly path can hand its own scope to the seam.
 */
export interface NearWallEnrollmentEntities {
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
  openings: OpeningSceneNode[]
  furniture: FurnitureSceneNode[]
}

/**
 * Enrolls the near-wall fade targets of an already-assembled root: which walls are
 * exterior, which junction fills track their fade, and, through the plan-space pairing,
 * which furniture stands against each wall so all of it fades as one target. This is the
 * one seam both scene-assembly paths call, so the incremental reconciler and the full
 * rebuild fade the same things (issue #437).
 *
 * The root must be assembled, not a bare wall sub-group: a wall's target also covers the
 * meshes that ride with it, its hosted opening fills and the furniture standing against
 * it, and those are built into sibling sub-groups that only the assembled root holds.
 *
 * The wall graph is the per-floor one the wall meshes were built from, so the fade
 * groups' `edgeIndexes` address the same edges the built junction fills are tagged with.
 */
export function enrollNearWallTargets(
  root: THREE.Object3D,
  entities: NearWallEnrollmentEntities,
): NearWallTarget[] {
  const { walls, rooms, openings, furniture } = entities
  return prepareNearWallTransparency(
    root,
    withAttachedFurniture(exteriorWalls(walls, rooms, openings), walls, furniture),
    junctionFadeGroups(buildFloorWallGraph(walls), walls, rooms, openings),
  )
}
