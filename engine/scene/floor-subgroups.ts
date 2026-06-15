import * as THREE from 'three'

import {
  WALL_NODE_PREFIX,
  buildWallGraph,
  exteriorWalls,
  type OpeningSceneNode,
  type PlanarGraph,
  type RoomSceneNode,
  type SceneNode,
  type WallSceneNode,
} from '../../core'
import type { MaterialProvider } from '../materials/material-provider'

import { addEdgeOverlay } from './edge-overlay'
import { buildOpeningFill } from './opening-fill-builder'
import { prepareNearWallTransparency, type NearWallTarget } from './near-wall-transparency'
import { buildRoomShell } from './room-builder'
import { markShadowCasters } from './shadow-casters'
import { buildWalls } from './wall-builder'

/** Builds one room's self-contained sub-group: shell, edge overlay, shadow flags. */
export function buildRoomSubgroup(node: RoomSceneNode, materials: MaterialProvider): THREE.Group {
  const group = buildRoomShell(node, materials)
  addEdgeOverlay(group)
  markShadowCasters(group)
  return group
}

/** Builds one opening's self-contained sub-group: fill, edge overlay, shadow flags. */
export function buildOpeningSubgroup(
  node: OpeningSceneNode,
  materials: MaterialProvider,
): THREE.Group {
  const group = buildOpeningFill(node, materials)
  addEdgeOverlay(group)
  markShadowCasters(group)
  return group
}

/**
 * Builds a floor's self-contained wall sub-group from its wall, room, and opening
 * nodes: the wall meshes, an edge overlay, shadow flags, and the near-wall fade
 * targets for its exterior walls.
 */
// eslint-disable-next-line max-params -- the four floor inputs read as positional arguments here.
export function buildWallSubgroup(
  floorWalls: WallSceneNode[],
  floorRooms: RoomSceneNode[],
  floorOpenings: OpeningSceneNode[],
  materials: MaterialProvider,
): { group: THREE.Group; nearWallTargets: NearWallTarget[] } {
  const group = buildWalls({
    graph: buildFloorWallGraph(floorWalls),
    walls: floorWalls,
    openingsByWall: groupOpeningsByHostWall(floorOpenings),
    materials,
  })
  addEdgeOverlay(group)
  markShadowCasters(group)
  const nearWallTargets = prepareNearWallTransparency(
    group,
    exteriorWalls(floorWalls, floorRooms, floorOpenings),
  )
  return { group, nearWallTargets }
}

/**
 * Assembles a floor's root group from its node and pre-built sub-groups: a floor
 * group named with the node id, carrying its entity id and elevation, holding the
 * sub-groups, wrapped in a root group (mirroring the built-scene root shape).
 */
export function assembleFloorRoot(node: SceneNode, subgroups: THREE.Object3D[]): THREE.Group {
  const floorGroup = new THREE.Group()
  floorGroup.name = node.id
  floorGroup.userData.entityId = node.id
  // Elevation is in millimetres; world units are millimetres throughout (no scale factor).
  floorGroup.position.y = node.elevation
  for (const subgroup of subgroups) {
    floorGroup.add(subgroup)
  }
  const root = new THREE.Group()
  root.add(floorGroup)
  return root
}

/** Builds the planar wall graph for a floor, keying each edge by stripped model id. */
function buildFloorWallGraph(floorWalls: WallSceneNode[]): PlanarGraph {
  return buildWallGraph(
    floorWalls.map((wall) => ({
      id: wall.id.slice(WALL_NODE_PREFIX.length),
      start: wall.start,
      end: wall.end,
      thickness: wall.thickness,
    })),
  )
}

/** Groups openings by their host wall id, skipping openings without a host. */
function groupOpeningsByHostWall(openings: OpeningSceneNode[]): Map<string, OpeningSceneNode[]> {
  const byHostWall = new Map<string, OpeningSceneNode[]>()
  for (const opening of openings) {
    if (opening.hostWallId === undefined) continue
    const existing = byHostWall.get(opening.hostWallId) ?? []
    existing.push(opening)
    byHostWall.set(opening.hostWallId, existing)
  }
  return byHostWall
}
