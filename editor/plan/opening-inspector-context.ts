import { OPENING_NODE_PREFIX, type Opening, type Project, type SceneGraph } from '../../core'

/**
 * Whether the wall under the opening with this raw id has a room along only one side at the
 * opening, the case where that room side sets a hung window's sashes.
 */
export function openingWallHasOneRoomSide(graph: SceneGraph, openingId: string): boolean {
  const node = graph.openings.find(
    (candidate) => candidate.id === `${OPENING_NODE_PREFIX}${openingId}`,
  )
  return node?.roomSide !== undefined
}

// The openings on the given floor, or an empty list when the floor is gone; handed to
// the opening inspector so it can clamp a widened opening against same-wall neighbors.
export function floorOpenings(project: Readonly<Project>, floorId: string): readonly Opening[] {
  return project.floors.find((floor) => floor.id === floorId)?.openings ?? []
}

export interface SelectedOpening {
  floorId: string
  opening: Opening
}

/**
 * The single selected raw `Opening` and its floor, or null. The selection holds
 * the namespaced scene-node id; this strips `OPENING_NODE_PREFIX` and finds the
 * raw model opening so the inspector edits the persisted record. Opening ids repeat
 * across floors, so the active floor is searched first, then the others in order.
 */
export function singleSelectedOpening(
  selectedIds: ReadonlySet<string>,
  project: Readonly<Project>,
  activeFloorId: string | null,
): SelectedOpening | null {
  if (selectedIds.size !== 1) {
    return null
  }
  const [onlyId] = selectedIds
  if (onlyId === undefined || !onlyId.startsWith(OPENING_NODE_PREFIX)) {
    return null
  }
  const rawId = onlyId.slice(OPENING_NODE_PREFIX.length)
  const activeFirst = [...project.floors].sort(
    (a, b) => Number(b.id === activeFloorId) - Number(a.id === activeFloorId),
  )
  for (const floor of activeFirst) {
    const opening = floor.openings.find((candidate) => candidate.id === rawId)
    if (opening !== undefined) {
      return { floorId: floor.id, opening }
    }
  }
  return null
}
