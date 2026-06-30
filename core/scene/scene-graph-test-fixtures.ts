import type { SceneGraph } from './scene-graph'

/** A scene graph with every entity collection empty, as a base for fixture assembly. */
export function emptySceneGraph(): SceneGraph {
  return {
    nodes: [],
    walls: [],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}
