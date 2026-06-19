import * as THREE from 'three'

import {
  exteriorWalls,
  junctionFadeGroups,
  type FurnitureSceneNode,
  type OpeningSceneNode,
  type RoomSceneNode,
  type SceneNode,
  type WallSceneNode,
} from '../../core'
import type { MaterialProvider, SurfaceRole } from '../materials/material-provider'

import { addEdgeOverlay } from './edge-overlay'
import { buildFurnitureMassing } from './furniture-builder'
import { buildOpeningFill } from './opening-fill-builder'
import { prepareNearWallTransparency, type NearWallTarget } from './near-wall-transparency'
import { buildRoomShell } from './room-builder'
import { markShadowCasters } from './shadow-casters'
import { buildWalls } from './wall-builder'
import { buildFloorWallGraph, groupOpeningsByHostWall } from './wall-scene-helpers'

/** A floor's wall, room, and opening nodes, with the material provider to build them. */
export interface WallSubgroupInput {
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
  openings: OpeningSceneNode[]
  materials: MaterialProvider
}

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

/** Builds one furniture instance's self-contained sub-group: box, edge overlay, shadow flags. */
export function buildFurnitureSubgroup(
  node: FurnitureSceneNode,
  materials: MaterialProvider,
  role: SurfaceRole = 'furniture',
): THREE.Group {
  const group = buildFurnitureMassing(node, materials, role)
  addEdgeOverlay(group)
  markShadowCasters(group)
  return group
}

/**
 * Builds a floor's self-contained wall sub-group from its wall, room, and opening
 * nodes: the wall meshes, an edge overlay, shadow flags, and the near-wall fade
 * targets for its exterior walls.
 */
export function buildWallSubgroup(input: WallSubgroupInput): {
  group: THREE.Group
  nearWallTargets: NearWallTarget[]
} {
  const { walls, rooms, openings, materials } = input
  const graph = buildFloorWallGraph(walls)
  const group = buildWalls({
    graph,
    walls,
    openingsByWall: groupOpeningsByHostWall(openings),
    materials,
  })
  addEdgeOverlay(group)
  markShadowCasters(group)
  const nearWallTargets = prepareNearWallTransparency(
    group,
    exteriorWalls(walls, rooms, openings),
    junctionFadeGroups(graph, walls, rooms, openings),
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
