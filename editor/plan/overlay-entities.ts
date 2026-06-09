import { entityAnchor, type SelectableSceneNode } from './overlay-anchor'
import { ariaLabel } from './overlay-label'
import type { SceneGraph, Point, UnitPreferences } from '../../core'

export interface OverlayEntity {
  id: string
  kind: SelectableSceneNode['kind']
  label: string
  anchor: Point
  selected: boolean
}

/** Projects the selectable scene-graph nodes into overlay entities, in wall, room, opening, dimension order. */
export function overlayEntities(
  graph: SceneGraph,
  selectedIds: ReadonlySet<string>,
  preferences: UnitPreferences,
): OverlayEntity[] {
  const toEntity = (node: SelectableSceneNode): OverlayEntity => ({
    id: node.id,
    kind: node.kind,
    label: ariaLabel(node, preferences),
    anchor: entityAnchor(node),
    selected: selectedIds.has(node.id),
  })

  return [
    ...graph.walls.map(toEntity),
    ...graph.rooms.map(toEntity),
    ...graph.openings.map(toEntity),
    ...graph.dimensions.map(toEntity),
  ]
}
