import * as THREE from 'three'

import {
  FLOOR_NODE_PREFIX,
  WALL_NODE_PREFIX,
  buildWallGraph,
  type OpeningSceneNode,
  type PlanarGraph,
  type SceneGraph,
  type SceneNode,
  type WallSceneNode,
} from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import type { MaterialProvider } from '../materials/material-provider'

import { buildRoomShell } from './room-builder'
import { buildWalls } from './wall-builder'

/** Root group that owns one child group per scene-graph node. */
export type SceneRoot = THREE.Group

/** Builds a Three.js group tree from the pure scene graph. */
export function buildScene(
  graph: SceneGraph,
  materials: MaterialProvider = new NeutralMaterialProvider(),
): SceneRoot {
  const root = new THREE.Group()
  for (const node of graph.nodes) {
    root.add(buildFloorGroup(node, graph, materials))
  }
  return root
}

function buildFloorGroup(
  node: SceneNode,
  graph: SceneGraph,
  materials: MaterialProvider,
): THREE.Group {
  const group = new THREE.Group()
  group.name = node.id
  group.userData.entityId = node.id
  // Elevation is in millimetres; world units are millimetres throughout (no scale factor).
  group.position.y = node.elevation
  const modelId = node.id.slice(FLOOR_NODE_PREFIX.length)
  const floorWalls = graph.walls.filter((wall) => wall.floorId === modelId)
  const floorOpenings = graph.openings.filter((opening) => opening.floorId === modelId)
  group.add(
    buildWalls({
      graph: buildFloorWallGraph(floorWalls),
      walls: floorWalls,
      openingsByWall: groupOpeningsByHostWall(floorOpenings),
      materials,
    }),
  )
  for (const room of graph.rooms) {
    if (room.floorId === modelId) {
      group.add(buildRoomShell(room, materials))
    }
  }
  return group
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
