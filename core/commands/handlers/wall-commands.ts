import { createWall } from '../../model/factories'
import type { Point, Project, Wall } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const ADD_WALL = 'floor/add-wall'
export const MOVE_WALL_ENDPOINT = 'floor/move-wall-endpoint'

export type WallEnd = 'start' | 'end'

export interface AddWallParams {
  floorId: string
  wall: Wall
}

export interface MoveWallEndpointParams {
  floorId: string
  wallId: string
  end: WallEnd
  to: Point
}

export function addWall(floorId: string, start: Point, end: Point): Command<AddWallParams> {
  // Build the wall eagerly at command-creation time so its id is fixed once and
  // redo reapplies the same wall rather than minting a new id, mirroring addFloor.
  return {
    type: ADD_WALL,
    params: { floorId, wall: createWall(start, end) },
    description: 'Draw wall',
  }
}

// Reassigns the whole floors slice because the inverse-capture proxy records
// only the root's top-level properties; the edited floor becomes a new object
// while untouched floors keep their reference for entity-keyed dirty tracking.
const addWallHandler: CommandHandler<Project, AddWallParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, walls: [...floor.walls, params.wall] } : floor,
    )
  },
}

// eslint-disable-next-line max-params -- floor, wall, which end, and the target point is the natural signature for moving one wall endpoint
export function moveWallEndpoint(
  floorId: string,
  wallId: string,
  end: WallEnd,
  to: Point,
): Command<MoveWallEndpointParams> {
  return {
    type: MOVE_WALL_ENDPOINT,
    params: { floorId, wallId, end, to },
    description: 'Move wall endpoint',
  }
}

// Reassigns the whole floors slice the same way addWall does so the
// inverse-capture proxy records the change and the dispatcher captures the
// inverse for undo; only the target floor and target wall become new objects.
const moveWallEndpointHandler: CommandHandler<Project, MoveWallEndpointParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId
        ? {
            ...floor,
            walls: floor.walls.map((wall) =>
              wall.id === params.wallId ? { ...wall, [params.end]: params.to } : wall,
            ),
          }
        : floor,
    )
  },
}

export function registerWallCommands(registry: CommandRegistry<Project>): CommandRegistry<Project> {
  return registry
    .register(ADD_WALL, addWallHandler)
    .register(MOVE_WALL_ENDPOINT, moveWallEndpointHandler)
}
