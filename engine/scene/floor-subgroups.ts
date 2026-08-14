import * as THREE from 'three'

import type {
  FurnitureSceneNode,
  OpeningSceneNode,
  RoomSceneNode,
  SceneNode,
  WallSceneNode,
} from '../../core'
import type { MaterialProvider, SurfaceRole } from '../materials/material-provider'

import { applyEdgeOverlay, type EdgeOverlayOptions } from './edge-overlay'
import { buildFurnitureMassing } from './furniture-builder'
import { buildOpeningFill } from './opening-fill-builder'
import { buildRoomShell } from './room-builder'
import { markShadowCasters } from './shadow-casters'
import { buildWalls } from './wall-builder'
import { buildFloorWallGraph, groupOpeningsByHostWall } from './wall-scene-helpers'

/**
 * A floor's wall and opening nodes, with the material provider to build them. The
 * inherited `edgeOverlay` is a view option (off by default), not a construction input.
 * Rooms are not an input: they told the old in-builder enrollment which walls were
 * exterior, and enrollment moved to the assembled floor root.
 */
export interface WallSubgroupInput extends EdgeOverlayOptions {
  walls: WallSceneNode[]
  openings: OpeningSceneNode[]
  materials: MaterialProvider
}

/** Build options for one furniture sub-group: its appearance role and the edge-overlay toggle. */
export interface FurnitureSubgroupOptions extends EdgeOverlayOptions {
  /** Which furniture appearance to build: placed, loading, or failed. Defaults to placed. */
  role?: SurfaceRole
}

/**
 * Builds one room's self-contained sub-group: shell, edge overlay (off unless the view
 * turns it on), shadow flags.
 */
export function buildRoomSubgroup(
  node: RoomSceneNode,
  materials: MaterialProvider,
  options: EdgeOverlayOptions = {},
): THREE.Group {
  const group = buildRoomShell(node, materials)
  applyEdgeOverlay(group, options)
  markShadowCasters(group)
  return group
}

/**
 * Builds one opening's self-contained sub-group: fill, edge overlay (off unless the view
 * turns it on), shadow flags.
 */
export function buildOpeningSubgroup(
  node: OpeningSceneNode,
  materials: MaterialProvider,
  options: EdgeOverlayOptions = {},
): THREE.Group {
  const group = buildOpeningFill(node, materials)
  applyEdgeOverlay(group, options)
  markShadowCasters(group)
  return group
}

/**
 * Builds one furniture instance's self-contained sub-group: box, edge overlay (off unless
 * the view turns it on), shadow flags.
 */
export function buildFurnitureSubgroup(
  node: FurnitureSceneNode,
  materials: MaterialProvider,
  options: FurnitureSubgroupOptions = {},
): THREE.Group {
  const group = buildFurnitureMassing(node, materials, options.role ?? 'furniture')
  applyEdgeOverlay(group, options)
  markShadowCasters(group)
  return group
}

/**
 * Builds a floor's self-contained wall sub-group from its wall, room, and opening
 * nodes: the wall meshes, an edge overlay (off unless the view turns it on), and
 * shadow flags.
 *
 * Near-wall fade targets are not enrolled here. A wall fades together with its hosted
 * opening fills and the furniture standing against it, and those live in sibling
 * sub-groups, so enrollment waits for the assembled floor root and runs over that
 * instead (`enrollNearWallTargets`, issue #437).
 */
export function buildWallSubgroup(input: WallSubgroupInput): THREE.Group {
  const { walls, openings, materials } = input
  const group = buildWalls({
    graph: buildFloorWallGraph(walls),
    walls,
    openingsByWall: groupOpeningsByHostWall(openings),
    materials,
  })
  applyEdgeOverlay(group, input)
  markShadowCasters(group)
  return group
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
