import type { SceneGraph } from './scene-graph'

/**
 * Reports whether a scene graph carries renderable 3D geometry. Walls, rooms,
 * openings, stairs, and furniture are geometry; underlays and dimensions are 2D
 * references and annotations, so a graph holding only those still reads as empty.
 */
export function sceneGraphHasGeometry(graph: SceneGraph): boolean {
  return (
    graph.walls.length > 0 ||
    graph.rooms.length > 0 ||
    graph.openings.length > 0 ||
    graph.stairs.length > 0 ||
    graph.furniture.length > 0
  )
}
