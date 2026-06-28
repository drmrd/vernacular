import {
  addStair,
  createStair,
  type AddStairParams,
  type Command,
  type Floor,
  type Point,
  type StairConnection,
} from '../../core'

/**
 * Builds the command that drops a default straight stair at `world`, rising from
 * the active floor to the floor directly above it. Returns null when no floor is
 * active or the active floor is already the topmost, because a stair has to span
 * two floors.
 */
export function stairPlacementCommand(
  floors: readonly Floor[],
  activeFloorId: string | null,
  world: Point,
): Command<AddStairParams> | null {
  const connection = stairConnectionAbove(floors, activeFloorId)
  if (connection === null) {
    return null
  }
  return addStair(createStair({ position: world, connection }))
}

function stairConnectionAbove(
  floors: readonly Floor[],
  activeFloorId: string | null,
): StairConnection | null {
  const active = floors.find((floor) => floor.id === activeFloorId)
  if (active === undefined) {
    return null
  }
  const above = floorAbove(floors, active)
  if (above === null) {
    return null
  }
  return { fromFloorId: active.id, toFloorId: above.id }
}

// The floor a stair rises to: the lowest floor whose elevation sits strictly
// above the active floor. Equal elevations are not "above", so a stair never
// connects two floors that share one elevation.
function floorAbove(floors: readonly Floor[], active: Floor): Floor | null {
  let nearest: Floor | null = null
  for (const candidate of floors) {
    if (candidate.elevation <= active.elevation) {
      continue
    }
    if (nearest === null || candidate.elevation < nearest.elevation) {
      nearest = candidate
    }
  }
  return nearest
}
