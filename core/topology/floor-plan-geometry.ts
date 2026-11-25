import { distance } from '../geometry/point'
import { pathLength, pointAlong } from '../geometry/wall-path'
import type { Floor, Opening, Point } from '../model/types'
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

/** Where an opening sits along the edge that holds its center, measured from the edge's first junction. */
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

function setAsideOf(network: WallNetwork): SetAside {
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

function edgeHoldingCenter(network: WallNetwork, opening: Opening) {
  const wall = network.walls.find((candidate) => candidate.id === opening.hostWallId)
  if (wall === undefined) return undefined
  const wallLength = pathLength(wall.path)
  const width = Math.min(opening.width, wallLength)
  const half = width / 2
  const center = pointAlong(
    wall.path,
    Math.max(half, Math.min(opening.position, wallLength - half)),
  )
  for (const edge of network.edges) {
    if (edge.wallId !== opening.hostWallId) continue
    const from = network.junctions[edge.from] as Point
    const to = network.junctions[edge.to] as Point
    const length = distance(from, to)
    const alongMm =
      ((center.x - from.x) * (to.x - from.x) + (center.y - from.y) * (to.y - from.y)) / length
    if (length > 0 && alongMm >= 0 && alongMm <= length) return { edge, alongMm, width }
  }
  return undefined
}

/** The span of each opening along the first edge of its host wall that holds its wall-clamped center; the span is not clipped to the edge. */
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
 * A deriver that keeps the plan geometry of each floor object, the wall network of each wall list,
 * and the opening spans of each network and openings list, so an edit rebuilds only what it changed.
 */
export function createPlanGeometryDeriver(): (floor: Floor) => FloorPlanGeometry {
  const geometryByFloor = new WeakMap<Floor, FloorPlanGeometry>()
  const spansByNetwork = new WeakMap<
    WallNetwork,
    { readonly openings: readonly Opening[]; readonly spans: readonly OpeningSpan[] }
  >()
  return (floor) => {
    const kept = geometryByFloor.get(floor)
    if (kept !== undefined) return kept
    const network = wallNetworkFor(floor.walls)
    let spans = spansByNetwork.get(network)
    if (spans?.openings !== floor.openings) {
      spans = { openings: floor.openings, spans: deriveOpeningSpans(network, floor.openings) }
      spansByNetwork.set(network, spans)
    }
    const geometry = geometryOf(floor, network, spans.spans)
    geometryByFloor.set(floor, geometry)
    return geometry
  }
}
