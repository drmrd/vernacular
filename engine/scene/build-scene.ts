import type { SceneGraph, SceneNode } from '../../core'
import * as THREE from 'three'

/** Root group that owns one child group per scene-graph node. */
export type SceneRoot = THREE.Group

/** Builds a Three.js group tree from the pure scene graph. */
export function buildScene(graph: SceneGraph): SceneRoot {
  const root = new THREE.Group()
  for (const node of graph.nodes) {
    root.add(buildNodeGroup(node))
  }
  return root
}

function buildNodeGroup(node: SceneNode): THREE.Group {
  const group = new THREE.Group()
  group.name = node.id
  group.userData.entityId = node.id
  group.position.y = node.elevation
  return group
}
