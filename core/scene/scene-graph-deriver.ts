import { deriveFloorNode } from './scene-graph'
import type { Floor, Project } from '../model/types'
import type { SceneGraph, SceneNode } from './scene-graph'

/**
 * Builds a stateful deriver that memoizes each floor's scene node by the source
 * Floor's object reference. This is the entity-keyed dirty tracking from the
 * design specification, sections 6.1 and 6.10: re-deriving reuses cached nodes
 * for floors whose reference is unchanged and rebuilds only replaced floors.
 * It pairs with the immutable-update handler convention, where an edited floor
 * becomes a new object while untouched floors keep their reference. The WeakMap
 * is keyed by the Floor object so dropped floors do not leak.
 */
export function createSceneGraphDeriver(): (project: Project) => SceneGraph {
  const cache = new WeakMap<Floor, SceneNode>()

  const nodeFor = (floor: Floor): SceneNode => {
    const cached = cache.get(floor)
    if (cached !== undefined) {
      return cached
    }

    const node = deriveFloorNode(floor)
    cache.set(floor, node)
    return node
  }

  return (project) => ({
    nodes: project.floors.map(nodeFor),
  })
}
