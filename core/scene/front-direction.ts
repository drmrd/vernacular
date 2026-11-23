import { DEFAULT_GRADE_ELEVATION_MM } from '../model/site'
import { doorFamilyOfType, isMarkedDoor, openingKindOfType } from '../registries/opening-kind'
import { FRONT_DIRECTION_TIE } from '../geometry/tolerance'
import { dot, negate, subtract } from '../geometry/vector'
import { exteriorWalls } from './exterior-walls'
import { FLOOR_NODE_PREFIX, type OpeningSceneNode, type SceneGraph } from './scene-graph'

/** A unit direction in the y-up plan frame. */
export type PlanDirection = { readonly x: number; readonly y: number }

/** Plan-down, the direction a front takes when no exterior door says otherwise. */
export const PLAN_DOWN: PlanDirection = { x: 0, y: -1 }

export type FrontDirectionInput = Pick<SceneGraph, 'walls' | 'rooms' | 'openings'> &
  Partial<Pick<SceneGraph, 'nodes' | 'gradeElevation'>>

/** An exterior door, its host wall's outward normal, and its floor's elevation. */
interface FrontCandidate {
  readonly opening: OpeningSceneNode
  readonly outward: PlanDirection
  readonly elevation: number
}

function dotWithPlanDown(direction: PlanDirection): number {
  return direction.x * PLAN_DOWN.x + direction.y * PLAN_DOWN.y
}

function hasHingedLeaf(candidate: FrontCandidate): boolean {
  const family = doorFamilyOfType(candidate.opening.type)
  return family === 'swing' || family === 'pivot'
}

/** True when `candidate` is a better front than `current`; see `entranceOf` for the rule. */
function beats(candidate: FrontCandidate, current: FrontCandidate): boolean {
  if (hasHingedLeaf(candidate) !== hasHingedLeaf(current)) {
    return hasHingedLeaf(candidate)
  }
  if (candidate.opening.width !== current.opening.width) {
    return candidate.opening.width > current.opening.width
  }
  const candidateDot = dotWithPlanDown(candidate.outward)
  const currentDot = dotWithPlanDown(current.outward)
  if (Math.abs(candidateDot - currentDot) > FRONT_DIRECTION_TIE) {
    return candidateDot > currentDot
  }
  return candidate.opening.id < current.opening.id
}

/** The doors in exterior walls of one floor, each with its host wall's outward normal. */
function exteriorDoorsOnFloor(
  input: FrontDirectionInput,
  floorId: string,
  elevation: number,
): FrontCandidate[] {
  const openings = input.openings.filter((opening) => opening.floorId === floorId)
  const walls = exteriorWalls(
    input.walls.filter((wall) => wall.floorId === floorId),
    input.rooms.filter((room) => room.floorId === floorId),
    openings,
  )
  return walls.flatMap((wall) =>
    openings
      .filter((opening) => wall.openingIds.includes(opening.id))
      .filter((opening) => openingKindOfType(opening.type) === 'door')
      .map((opening) => ({ opening, outward: wall.outwardNormal, elevation })),
  )
}

/** The elevation of each floor that has a node, keyed by floor id. */
function floorElevations(input: FrontDirectionInput): Map<string, number> {
  const elevations = new Map<string, number>()
  for (const node of input.nodes ?? []) {
    elevations.set(node.id.slice(FLOOR_NODE_PREFIX.length), node.elevation)
  }
  return elevations
}

/**
 * True when `level` is tried before `other`: at or above grade from the lowest
 * up, then below grade from the highest down.
 */
function levelPrecedes(level: number, other: number, grade: number): boolean {
  const levelAtOrAbove = level >= grade
  if (levelAtOrAbove !== other >= grade) {
    return levelAtOrAbove
  }
  return levelAtOrAbove ? level < other : level > other
}

/** The first level, in `levelPrecedes` order, that has a candidate door. */
function entranceLevel(candidates: FrontCandidate[], grade: number): number | undefined {
  return candidates.reduce<number | undefined>(
    (current, { elevation }) =>
      current === undefined || levelPrecedes(elevation, current, grade) ? elevation : current,
    undefined,
  )
}

/** The candidate that beats all the others, or undefined when there are none. */
function bestCandidate(candidates: FrontCandidate[]): FrontCandidate | undefined {
  return candidates.reduce<FrontCandidate | undefined>(
    (current, candidate) =>
      current === undefined || beats(candidate, current) ? candidate : current,
    undefined,
  )
}

/** The first marked door, floors in the order of the walls and then openings in document order. */
function firstMarkedDoor(
  input: FrontDirectionInput,
  floorIds: readonly string[],
): OpeningSceneNode | undefined {
  return floorIds
    .flatMap((floorId) => input.openings.filter((opening) => opening.floorId === floorId))
    .find(isMarkedDoor)
}

/** Of a door's two normals, the one nearer plan-down, then the one nearer plan-right. */
function tieBrokenNormal(normal: PlanDirection): PlanDirection {
  const opposite = negate(normal)
  const downGap = dotWithPlanDown(normal) - dotWithPlanDown(opposite)
  if (Math.abs(downGap) > FRONT_DIRECTION_TIE) {
    return downGap > 0 ? normal : opposite
  }
  return normal.x > opposite.x ? normal : opposite
}

/** The side of an interior door that faces away from the center of its floor's walls. */
function awayFromWallCenter(input: FrontDirectionInput, door: OpeningSceneNode): PlanDirection {
  const ends = input.walls
    .filter((wall) => wall.floorId === door.floorId)
    .flatMap((wall) => [wall.start, wall.end])
  const xs = ends.map((end) => end.x)
  const ys = ends.map((end) => end.y)
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2
  const outwardness = dot(subtract(door.center, { x: centerX, y: centerY }), door.normal)
  if (Math.abs(outwardness) <= FRONT_DIRECTION_TIE) {
    return tieBrokenNormal(door.normal)
  }
  return outwardness > 0 ? door.normal : negate(door.normal)
}

/** The direction a marked door faces: its exterior run's outward normal, else away from the center. */
function markedFront(
  input: FrontDirectionInput,
  door: OpeningSceneNode,
  candidates: readonly FrontCandidate[],
): PlanDirection {
  const exterior = candidates.find(
    ({ opening }) => opening.floorId === door.floorId && opening.id === door.id,
  )
  return exterior?.outward ?? awayFromWallCenter(input, door)
}

/** The door a building is entered by, how it was found, and the direction it faces. */
export interface Entrance {
  /** The entrance door; undefined when no door is marked and none is exterior. */
  readonly door: OpeningSceneNode | undefined
  /** 'marked' when the owner marked a door, 'guessed' when a rule chose it, 'none' with no door. */
  readonly source: 'marked' | 'guessed' | 'none'
  readonly front: PlanDirection
}

/**
 * The entrance of the building. A marked door wins over the guess: the first
 * marked door in document order (floors in the order of the walls, then openings
 * in order), and a mark on a window is ignored. Its front is the outward normal
 * of its exterior run, or for an interior door the side away from the center of
 * its floor's walls. Without a mark, the guessed door and the outward normal of
 * the wall that hosts it. For the guess, only the first level with an exterior
 * door competes: levels at or above grade from the lowest up, then levels below
 * grade from the highest down. On that level a swing or pivot door comes before
 * a sliding, folding, or cased one, and then the widest door wins. Equal widths
 * prefer the direction nearer plan-down (directions within a rounding tolerance
 * are equally near), then the opening id that sorts first as a string (so
 * `opening:10` comes before `opening:9`), then the floor that comes first in the
 * walls. With no marked door and no exterior door there is no door and the front
 * is plan-down.
 */
export function entranceOf(input: FrontDirectionInput): Entrance {
  const grade = input.gradeElevation ?? DEFAULT_GRADE_ELEVATION_MM
  const elevations = floorElevations(input)
  const floorIds = [...new Set(input.walls.map((wall) => wall.floorId))]
  const candidates = floorIds.flatMap((floorId) =>
    exteriorDoorsOnFloor(input, floorId, elevations.get(floorId) ?? grade),
  )
  const markedDoor = firstMarkedDoor(input, floorIds)
  if (markedDoor !== undefined) {
    return { door: markedDoor, source: 'marked', front: markedFront(input, markedDoor, candidates) }
  }
  return guessedEntrance(candidates, grade)
}

/** The entrance a rule picks from the exterior doors, or none when there are no candidates. */
function guessedEntrance(candidates: FrontCandidate[], grade: number): Entrance {
  const level = entranceLevel(candidates, grade)
  const best = bestCandidate(candidates.filter(({ elevation }) => elevation === level))
  return best === undefined
    ? { door: undefined, source: 'none', front: PLAN_DOWN }
    : { door: best.opening, source: 'guessed', front: best.outward }
}

/** The plan direction the building faces: the front of its entrance. */
export function frontDirection(input: FrontDirectionInput): PlanDirection {
  return entranceOf(input).front
}
