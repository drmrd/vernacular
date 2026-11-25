import { pathLength, pointAlong } from '../geometry/wall-path'
import type { Floor, Opening } from '../model/types'
import { getOrCreate } from './get-or-create'
import { distanceAlongEdge } from './opening-edge'
import { clampedOpeningPlacement } from './openings'
import {
  isLoopEdge,
  type PlanRoom,
  type WallFaceRecord,
  type WallFaceStretch,
  type WallSide,
} from './wall-face-records'
import {
  deriveWallNetwork,
  derivePlanRooms,
  type NetworkEdge,
  type NetworkWall,
  type PlanGeometryRegistries,
  type WallNetwork,
} from './wall-network'
import { wallNetworkFor } from './wall-network-memo'

export { derivePlanRooms, deriveWallNetwork }
export type {
  NetworkEdge,
  NetworkWall,
  PlanGeometryRegistries,
  PlanRoom,
  WallFaceRecord,
  WallFaceStretch,
  WallNetwork,
  WallSide,
}

/** What the plan geometry leaves out of the rooms, by wall or record id. */
export interface SetAside {
  /**
   * Walls with no edge that reaches another junction, because their two ends are within the join
   * distance or merged into one junction.
   */
  readonly zeroLengthWallIds: readonly string[]
  readonly coveredWallIds: readonly string[]
  readonly unboundRecordIds: readonly string[]
}

/**
 * Where an opening sits along the edge that holds its center, measured from the edge's first
 * junction.
 */
export interface OpeningSpan {
  readonly openingId: string
  readonly edgeIndex: number
  readonly fromMm: number
  readonly toMm: number
}

export interface FloorPlanGeometry {
  readonly floorId: string
  readonly network: WallNetwork
  readonly rooms: readonly PlanRoom[]
  readonly setAside: SetAside
  readonly openingSpans: readonly OpeningSpan[]
}

function collectSetAside(network: WallNetwork): SetAside {
  const wallIdsReachingAnotherJunction = new Set(
    network.edges.filter((edge) => !isLoopEdge(edge)).map((edge) => edge.wallId),
  )
  return {
    zeroLengthWallIds: network.walls
      .filter((wall) => !wallIdsReachingAnotherJunction.has(wall.id))
      .map((wall) => wall.id),
    coveredWallIds: [],
    unboundRecordIds: [],
  }
}

const setAsideByNetwork = new WeakMap<WallNetwork, SetAside>()

/** Kept per network, like its rooms, so an edit that keeps the network keeps the set-aside too. */
function setAsideOf(network: WallNetwork): SetAside {
  return getOrCreate(setAsideByNetwork, network, () => collectSetAside(network))
}

interface CenterOnEdge {
  readonly edge: NetworkEdge
  readonly alongMm: number
  readonly width: number
}

function edgeHoldingCenter(network: WallNetwork, opening: Opening): CenterOnEdge | undefined {
  const wall = network.walls.find((candidate) => candidate.id === opening.hostWallId)
  if (wall === undefined) return undefined
  const { position, width } = clampedOpeningPlacement(
    opening.position,
    opening.width,
    pathLength(wall.path),
  )
  const center = pointAlong(wall.path, position)
  for (const edge of network.edges) {
    if (edge.wallId !== opening.hostWallId) continue
    const from = network.junctions[edge.from]
    const to = network.junctions[edge.to]
    if (from === undefined || to === undefined) continue
    const alongMm = distanceAlongEdge(center, from, to)
    if (alongMm !== undefined) return { edge, alongMm, width }
  }
  return undefined
}

/**
 * The span of each opening along the first edge of its host wall that holds its wall-clamped
 * center. The span is not clipped to the edge.
 */
export function deriveOpeningSpans(
  network: WallNetwork,
  openings: readonly Opening[],
): OpeningSpan[] {
  return openings.flatMap((opening) => {
    const held = edgeHoldingCenter(network, opening)
    return held === undefined
      ? []
      : [
          {
            openingId: opening.id,
            edgeIndex: held.edge.index,
            fromMm: held.alongMm - held.width / 2,
            toMm: held.alongMm + held.width / 2,
          },
        ]
  })
}

function geometryOf(
  floor: Floor,
  network: WallNetwork,
  openingSpans: readonly OpeningSpan[],
): FloorPlanGeometry {
  return {
    floorId: floor.id,
    network,
    rooms: derivePlanRooms(network),
    setAside: setAsideOf(network),
    openingSpans,
  }
}

export function deriveFloorPlanGeometry(
  floor: Floor,
  registries?: PlanGeometryRegistries,
): FloorPlanGeometry {
  const network = wallNetworkFor(floor.walls, registries)
  return geometryOf(floor, network, deriveOpeningSpans(network, floor.openings))
}

/**
 * A deriver that keeps the plan geometry of each floor object and the opening spans of each network
 * and openings list, so an edit rebuilds only what it changed. It resolves wall thickness with the
 * built-in registry, as `deriveRooms` does, so the scene graph reuses the networks it builds.
 */
export function createPlanGeometryDeriver(): (floor: Floor) => FloorPlanGeometry {
  const geometryByFloor = new WeakMap<Floor, FloorPlanGeometry>()
  const spansByNetwork = new WeakMap<
    WallNetwork,
    WeakMap<readonly Opening[], readonly OpeningSpan[]>
  >()
  const spansFor = (network: WallNetwork, openings: readonly Opening[]): readonly OpeningSpan[] => {
    const spansByOpenings = getOrCreate(spansByNetwork, network, () => new WeakMap())
    return getOrCreate(spansByOpenings, openings, () => deriveOpeningSpans(network, openings))
  }
  return (floor) =>
    getOrCreate(geometryByFloor, floor, () => {
      const network = wallNetworkFor(floor.walls)
      return geometryOf(floor, network, spansFor(network, floor.openings))
    })
}
