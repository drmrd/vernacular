import { rotatePoint, translatePoint } from '../../geometry/point'
import type { Floor, Point, Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'
import { mapTargetFloor } from './map-target-floor'

// Moves the start/end of every wall and dimension whose id is in `idSet` through `move`,
// leaving openings and every unselected entity reference-equal so dirty tracking stays
// entity-keyed. Returns a new floor only when at least one entity changed identity.
function transformFloorEntities(
  floor: Floor,
  idSet: ReadonlySet<string>,
  move: (point: Point) => Point,
): Floor {
  return {
    ...floor,
    walls: floor.walls.map((wall) =>
      idSet.has(wall.id) ? { ...wall, start: move(wall.start), end: move(wall.end) } : wall,
    ),
    dimensions: floor.dimensions.map((dimension) =>
      idSet.has(dimension.id)
        ? { ...dimension, start: move(dimension.start), end: move(dimension.end) }
        : dimension,
    ),
  }
}

// Removes every selected wall, dimension, and opening, and additionally cascades to
// any opening hosted on a deleted wall so no opening is left without a host.
function deleteFloorEntities(floor: Floor, idSet: ReadonlySet<string>): Floor {
  const deletedWallIds = new Set(
    floor.walls.filter((wall) => idSet.has(wall.id)).map((wall) => wall.id),
  )
  return {
    ...floor,
    walls: floor.walls.filter((wall) => !idSet.has(wall.id)),
    openings: floor.openings.filter(
      (opening) => !idSet.has(opening.id) && !deletedWallIds.has(opening.hostWallId),
    ),
    dimensions: floor.dimensions.filter((dimension) => !idSet.has(dimension.id)),
  }
}

export const TRANSLATE_ENTITIES = 'floor/translate-entities'
export const ROTATE_ENTITIES = 'floor/rotate-entities'
export const DELETE_ENTITIES = 'floor/delete-entities'

export interface TranslateEntitiesParams {
  floorId: string
  entityIds: string[]
  delta: Point
}

export interface RotateEntitiesParams {
  floorId: string
  entityIds: string[]
  pivot: Point
  radians: number
}

export interface DeleteEntitiesParams {
  floorId: string
  entityIds: string[]
}

export function translateEntities(
  floorId: string,
  entityIds: string[],
  delta: Point,
): Command<TranslateEntitiesParams> {
  return {
    type: TRANSLATE_ENTITIES,
    params: { floorId, entityIds, delta },
    description: 'Move',
  }
}

const translateEntitiesHandler: CommandHandler<Project, TranslateEntitiesParams> = {
  apply(state, params) {
    const idSet = new Set(params.entityIds)
    mapTargetFloor(state, params.floorId, (floor) =>
      transformFloorEntities(floor, idSet, (point) => translatePoint(point, params.delta)),
    )
  },
}

// eslint-disable-next-line max-params -- floor, the entity ids, the pivot, and the angle is the natural signature for rotating a selection
export function rotateEntities(
  floorId: string,
  entityIds: string[],
  pivot: Point,
  radians: number,
): Command<RotateEntitiesParams> {
  return {
    type: ROTATE_ENTITIES,
    params: { floorId, entityIds, pivot, radians },
    description: 'Rotate',
  }
}

const rotateEntitiesHandler: CommandHandler<Project, RotateEntitiesParams> = {
  apply(state, params) {
    const idSet = new Set(params.entityIds)
    mapTargetFloor(state, params.floorId, (floor) =>
      transformFloorEntities(floor, idSet, (point) =>
        rotatePoint(point, params.pivot, params.radians),
      ),
    )
  },
}

export function deleteEntities(
  floorId: string,
  entityIds: string[],
): Command<DeleteEntitiesParams> {
  return {
    type: DELETE_ENTITIES,
    params: { floorId, entityIds },
    description: 'Delete',
  }
}

const deleteEntitiesHandler: CommandHandler<Project, DeleteEntitiesParams> = {
  apply(state, params) {
    const idSet = new Set(params.entityIds)
    mapTargetFloor(state, params.floorId, (floor) => deleteFloorEntities(floor, idSet))
  },
}

function collectSelectedEndpoints(floor: Floor, idSet: ReadonlySet<string>): Point[] {
  const endpoints: Point[] = []
  for (const wall of floor.walls) {
    if (idSet.has(wall.id)) endpoints.push(wall.start, wall.end)
  }
  for (const dimension of floor.dimensions) {
    if (idSet.has(dimension.id)) endpoints.push(dimension.start, dimension.end)
  }
  return endpoints
}

function midpoint(min: number, max: number): number {
  return (min + max) / 2
}

/**
 * Midpoint of the axis-aligned bounding box of every selected wall and dimension
 * endpoint. Returns the origin when the selection has no measurable geometry.
 */
export function selectionCenter(floor: Floor, entityIds: Iterable<string>): Point {
  const endpoints = collectSelectedEndpoints(floor, new Set(entityIds))
  if (endpoints.length === 0) return { x: 0, y: 0 }
  const xs = endpoints.map((point) => point.x)
  const ys = endpoints.map((point) => point.y)
  return {
    x: midpoint(Math.min(...xs), Math.max(...xs)),
    y: midpoint(Math.min(...ys), Math.max(...ys)),
  }
}

export function registerTransformCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(TRANSLATE_ENTITIES, translateEntitiesHandler)
    .register(ROTATE_ENTITIES, rotateEntitiesHandler)
    .register(DELETE_ENTITIES, deleteEntitiesHandler)
}
