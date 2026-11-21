import {
  openingRoomSide,
  OPENING_NODE_PREFIX,
  type Opening,
  type Project,
  type SceneGraph,
} from '../../core'

/**
 * Whether the wall under the opening with this raw id has a room along only one side at the
 * opening, the case where that room side sets a hung window's sashes.
 */
export function openingWallHasOneRoomSide(graph: SceneGraph, openingId: string): boolean {
  const node = graph.openings.find(
    (candidate) => candidate.id === `${OPENING_NODE_PREFIX}${openingId}`,
  )
  return node !== undefined && openingRoomSide(node, graph.rooms) !== undefined
}

// The openings on the given floor, or an empty list when the floor is gone; handed to
// the opening inspector so it can clamp a widened opening against same-wall neighbors.
export function floorOpenings(project: Readonly<Project>, floorId: string): readonly Opening[] {
  return project.floors.find((floor) => floor.id === floorId)?.openings ?? []
}
