import type { FurnitureInstance, SceneGraph } from '../../core'
import type { EditLayer } from '../tools/edit-layer-context'

/**
 * Narrow a scene graph to only the active edit layer's selectable collections.
 *
 * Selection-finding code (hit-test, marquee, hover) discovers candidates from
 * the scene graph, so emptying a collection makes its elements inert: they
 * remain visible elsewhere (this projection is not what gets rendered) but
 * cannot be selected while another layer is active. Only the selectable
 * collections are gated; `nodes`, `underlays`, and `stairs` always pass through
 * unchanged. The `'all'` layer preserves today's behavior by returning the
 * scene unchanged.
 */
export function scopeSceneToLayer(scene: SceneGraph, layer: EditLayer): SceneGraph {
  switch (layer) {
    case 'all':
      return scene
    case 'walls':
      return { ...scene, openings: [], dimensions: [], furniture: [] }
    case 'openings':
      return { ...scene, walls: [], rooms: [], dimensions: [], furniture: [] }
    case 'furniture':
      return { ...scene, walls: [], rooms: [], openings: [], dimensions: [] }
    case 'annotations':
      return { ...scene, walls: [], rooms: [], openings: [], furniture: [] }
  }
}

/**
 * Narrow a furniture list to only what the active edit layer leaves selectable.
 *
 * Furniture stays selectable on the `'all'` and `'furniture'` layers; every
 * other layer empties the list so furniture becomes inert (visible but not a
 * selection candidate) while that layer is active.
 */
export function scopeFurnitureToLayer(
  furniture: readonly FurnitureInstance[],
  layer: EditLayer,
): readonly FurnitureInstance[] {
  return layer === 'all' || layer === 'furniture' ? furniture : []
}
