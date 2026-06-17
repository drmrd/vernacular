import * as THREE from 'three'

import { FLOOR_NODE_PREFIX, type SceneGraph, type SceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import type { MaterialProvider } from '../materials/material-provider'

import { addEdgeOverlay } from './edge-overlay'
import { buildFurnitureMassing } from './furniture-builder'
import { buildOpeningFill } from './opening-fill-builder'
import { buildRoomShell } from './room-builder'
import { buildWalls } from './wall-builder'
import { buildFloorWallGraph, groupOpeningsByHostWall } from './wall-scene-helpers'

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
  // Draw a dark edge line along every surface so a wall reads against the floor
  // and its neighbors whatever the lighting and paint are (ADR-0078).
  addEdgeOverlay(root)
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
  for (const opening of floorOpenings) {
    group.add(buildOpeningFill(opening, materials))
  }
  const floorFurniture = graph.furniture.filter((item) => item.floorId === modelId)
  for (const furniture of floorFurniture) {
    group.add(buildFurnitureMassing(furniture, materials))
  }
  return group
}
