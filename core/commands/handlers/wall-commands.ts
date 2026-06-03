import { createWall } from '../../model/factories'
import type { Point, Project, Wall } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const ADD_WALL = 'floor/add-wall'

export interface AddWallParams {
  floorId: string
  wall: Wall
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

export function registerWallCommands(registry: CommandRegistry<Project>): CommandRegistry<Project> {
  return registry.register(ADD_WALL, addWallHandler)
}
