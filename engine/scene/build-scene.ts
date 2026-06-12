import * as THREE from 'three'

import { FLOOR_NODE_PREFIX, type SceneGraph, type SceneNode, type WallSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import type { MaterialProvider } from '../materials/material-provider'

import { buildWallMesh } from './wall-builder'

/** Root group that owns one child group per scene-graph node. */
export type SceneRoot = THREE.Group

/** Builds a Three.js group tree from the pure scene graph. */
export function buildScene(
  graph: SceneGraph,
  materials: MaterialProvider = new NeutralMaterialProvider(),
): SceneRoot {
  const root = new THREE.Group()
  for (const node of graph.nodes) {
    root.add(buildFloorGroup(node, graph.walls, materials))
  }
  return root
}

function buildFloorGroup(
  node: SceneNode,
  walls: WallSceneNode[],
  materials: MaterialProvider,
): THREE.Group {
  const group = new THREE.Group()
  group.name = node.id
  group.userData.entityId = node.id
  // Elevation is in millimetres; world units are millimetres throughout (no scale factor).
  group.position.y = node.elevation
  const modelId = node.id.slice(FLOOR_NODE_PREFIX.length)
  for (const wall of walls) {
    if (wall.floorId === modelId) {
      group.add(buildWallMesh(wall, materials))
    }
  }
  return group
}
