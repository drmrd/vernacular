import { rotatePoint, translatePoint } from '../../geometry/point'
import type { Floor, Point, Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

// Applies `update` to the floor whose id matches `floorId`, leaving all other floors
// reference-equal. Reassigns state.floors so the inverse-capture proxy (ADR-0005) records
// the slice replacement and the dispatcher can capture the inverse for undo.
function mapTargetFloor(state: Project, floorId: string, update: (floor: Floor) => Floor): void {
  state.floors = state.floors.map((floor) => (floor.id === floorId ? update(floor) : floor))
}

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

export const TRANSLATE_ENTITIES = 'floor/translate-entities'
export const ROTATE_ENTITIES = 'floor/rotate-entities'

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

// Collects the start and end of every selected wall and dimension into `endpoints`.
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

/**
 * Midpoint of the axis-aligned bounding box of every selected wall and dimension
 * endpoint. Returns the origin when the selection has no measurable geometry.
 */
export function selectionCenter(floor: Floor, entityIds: Iterable<string>): Point {
  const endpoints = collectSelectedEndpoints(floor, new Set(entityIds))
  if (endpoints.length === 0) return { x: 0, y: 0 }
  const xs = endpoints.map((point) => point.x)
  const ys = endpoints.map((point) => point.y)
  const half = 2
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / half,
    y: (Math.min(...ys) + Math.max(...ys)) / half,
  }
}

export function registerTransformCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(TRANSLATE_ENTITIES, translateEntitiesHandler)
    .register(ROTATE_ENTITIES, rotateEntitiesHandler)
}
