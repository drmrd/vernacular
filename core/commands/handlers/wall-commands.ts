import { createWall } from '../../model/factories'
import type { Floor, Point, Project, Wall, WallEnd } from '../../model/types'
import { uncoveredParts } from '../../topology/uncovered-parts'
import { assertPositiveLength } from '../../units/length-bounds'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'
import { mapTargetFloor } from './map-target-floor'

export type { WallEnd } from '../../model/types'

export const ADD_WALL = 'floor/add-wall'
export const MOVE_WALL_ENDPOINT = 'floor/move-wall-endpoint'
export const SET_WALL_THICKNESS = 'floor/set-wall-thickness'

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

export interface SetWallThicknessParams {
  floorId: string
  wallId: string
  thickness: number
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

const addWallHandler: CommandHandler<Project, AddWallParams> = {
  apply(state, { floorId, wall }) {
    const floor = state.floors.find((candidate) => candidate.id === floorId)
    if (floor === undefined) return

    const parts = uncoveredParts(floor.walls, wall)
    if (parts.length === 0) return

    const occupiedIds = new Set(
      [floor.walls, floor.openings, floor.dimensions, floor.underlays, floor.furniture].flatMap(
        (entities) => entities.map(({ id }) => id),
      ),
    )
    let partNumber = 2
    const walls = parts.map((part, index) => {
      if (part === wall) return wall
      if (index === 0) return { ...wall, ...part }

      let id: string
      do {
        id = `${wall.id}-part-${partNumber}`
        partNumber += 1
      } while (occupiedIds.has(id))
      return { ...wall, ...part, id }
    })

    mapTargetFloor(state, floorId, () => ({ ...floor, walls: [...floor.walls, ...walls] }))
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

// Reassigns the whole floors slice, then maps the target floor's inner walls
// array, so the inverse-capture proxy records the change and the dispatcher
// captures the inverse for undo; only the target floor and target wall become
// new objects while every untouched floor and wall keeps its reference.
// eslint-disable-next-line max-params -- the floors slice plus the floor, wall, and per-wall update is the minimal signature for replacing one wall in place
function updateWall(
  floors: Floor[],
  floorId: string,
  wallId: string,
  update: (wall: Wall) => Wall,
): Floor[] {
  return floors.map((floor) =>
    floor.id === floorId
      ? { ...floor, walls: floor.walls.map((wall) => (wall.id === wallId ? update(wall) : wall)) }
      : floor,
  )
}

const moveWallEndpointHandler: CommandHandler<Project, MoveWallEndpointParams> = {
  apply(state, params) {
    state.floors = updateWall(state.floors, params.floorId, params.wallId, (wall) => ({
      ...wall,
      [params.end]: params.to,
    }))
  },
}

export function setWallThickness(
  floorId: string,
  wallId: string,
  thickness: number,
): Command<SetWallThicknessParams> {
  return {
    type: SET_WALL_THICKNESS,
    params: { floorId, wallId, thickness },
    description: 'Set wall thickness',
  }
}

const setWallThicknessHandler: CommandHandler<Project, SetWallThicknessParams> = {
  apply(state, params) {
    assertPositiveLength(params.thickness, 'Thickness')
    state.floors = updateWall(state.floors, params.floorId, params.wallId, (wall) => ({
      ...wall,
      thickness: params.thickness,
    }))
  },
}

export function registerWallCommands(registry: CommandRegistry<Project>): CommandRegistry<Project> {
  return registry
    .register(ADD_WALL, addWallHandler)
    .register(MOVE_WALL_ENDPOINT, moveWallEndpointHandler)
    .register(SET_WALL_THICKNESS, setWallThicknessHandler)
}
