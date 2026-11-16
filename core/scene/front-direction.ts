import { openingKindOfType } from '../registries/opening-kind'
import { exteriorWalls } from './exterior-walls'
import type { OpeningSceneNode, SceneGraph } from './scene-graph'

/** A unit direction in the y-up plan frame. */
export type PlanDirection = { readonly x: number; readonly y: number }

/** Plan-down, the direction a front takes when no exterior door says otherwise. */
export const PLAN_DOWN: PlanDirection = { x: 0, y: -1 }

export type FrontDirectionInput = Pick<SceneGraph, 'walls' | 'rooms' | 'openings'>

/** An exterior door and the outward normal of the wall that hosts it. */
interface FrontCandidate {
  readonly opening: OpeningSceneNode
  readonly outward: PlanDirection
}

function dotWithPlanDown(direction: PlanDirection): number {
  return direction.x * PLAN_DOWN.x + direction.y * PLAN_DOWN.y
}

/** True when `candidate` is a better front than `current`: wider, then nearer plan-down, then the opening id that sorts first as a string (so `opening:10` comes before `opening:9`). */
function beats(candidate: FrontCandidate, current: FrontCandidate): boolean {
  if (candidate.opening.width !== current.opening.width) {
    return candidate.opening.width > current.opening.width
  }
  const candidateDot = dotWithPlanDown(candidate.outward)
  const currentDot = dotWithPlanDown(current.outward)
  if (candidateDot !== currentDot) {
    return candidateDot > currentDot
  }
  return candidate.opening.id < current.opening.id
}

/** The doors in exterior walls of one floor, each with its host wall's outward normal. */
function exteriorDoorsOnFloor(input: FrontDirectionInput, floorId: string): FrontCandidate[] {
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
      .map((opening) => ({ opening, outward: wall.outwardNormal })),
  )
}

/**
 * The plan direction the building faces: the outward normal of the wall that
 * hosts the widest exterior door. Equal widths prefer the direction nearer
 * plan-down, then the opening id that sorts first as a string (so `opening:10`
 * comes before `opening:9`). With no exterior door it is plan-down.
 */
export function frontDirection(input: FrontDirectionInput): PlanDirection {
  const floorIds = [...new Set(input.walls.map((wall) => wall.floorId))]
  const candidates = floorIds.flatMap((floorId) => exteriorDoorsOnFloor(input, floorId))
  const best = candidates.reduce<FrontCandidate | undefined>(
    (current, candidate) =>
      current === undefined || beats(candidate, current) ? candidate : current,
    undefined,
  )
  return best === undefined ? PLAN_DOWN : best.outward
}
