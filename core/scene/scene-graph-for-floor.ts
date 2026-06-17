import { FLOOR_NODE_PREFIX, type SceneGraph } from './scene-graph'

const emptyGraph = (): SceneGraph => ({
  nodes: [],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
})

const onFloor =
  <Node extends { floorId: string }>(floorId: string) =>
  (node: Node): boolean =>
    node.floorId === floorId

/** Narrow a scene graph to a single active floor (empty when no floor is active). */
export function sceneGraphForFloor(graph: SceneGraph, floorId: string | null): SceneGraph {
  if (floorId === null) {
    return emptyGraph()
  }
  return {
    nodes: graph.nodes.filter(
      (node) =>
        node.id === `${FLOOR_NODE_PREFIX}${floorId}` ||
        ('floorId' in node && node.floorId === floorId),
    ),
    walls: graph.walls.filter(onFloor(floorId)),
    rooms: graph.rooms.filter(onFloor(floorId)),
    underlays: graph.underlays.filter(onFloor(floorId)),
    openings: graph.openings.filter(onFloor(floorId)),
    dimensions: graph.dimensions.filter(onFloor(floorId)),
    stairs: graph.stairs.filter(onFloor(floorId)),
    furniture: graph.furniture.filter(onFloor(floorId)),
  }
}
