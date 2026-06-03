import type { Floor, Project } from '../model/types'

/** Namespaces scene-node ids by source-entity kind so ids stay globally unique. */
const FLOOR_NODE_PREFIX = 'floor:'

export interface SceneNode {
  /** Stable, kind-namespaced id derived from the source entity id. */
  id: string
  kind: 'floor'
  name: string
  elevation: number
}

export interface SceneGraph {
  nodes: SceneNode[]
}

export function deriveFloorNode(floor: Floor): SceneNode {
  return {
    id: `${FLOOR_NODE_PREFIX}${floor.id}`,
    kind: 'floor',
    name: floor.name,
    elevation: floor.elevation,
  }
}

/** Pure projection of the project model into a normalized scene graph. */
export function deriveSceneGraph(project: Project): SceneGraph {
  return {
    nodes: project.floors.map(deriveFloorNode),
  }
}
