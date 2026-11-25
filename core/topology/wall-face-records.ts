import { projectOntoPath, type WallPath } from '../geometry/wall-path'
import type { Point } from '../model/types'
import type { EdgeSideRooms, RoomWalk } from './room-walk'
import type { Room } from './rooms'
import type { NetworkEdge, WallNetwork } from './wall-network'

/** `'positive'` is the left of a wall from its start to its end, as `leftNormal` has it. */
export type WallSide = 'positive' | 'negative'

/** A stretch of one wall face along which the same room lies. */
export interface WallFaceStretch {
  /** Where the stretch starts, in mm along the wall's path from its start. */
  readonly fromMm: number
  /** Where the stretch ends, in mm along the wall's path from its start. */
  readonly toMm: number
  /** The index into the plan's rooms of the room along the stretch, if any. */
  readonly roomIndex: number | undefined
}

/** One face of a wall, cut where the room along it changes. */
export interface WallFaceRecord {
  readonly wallId: string
  readonly side: WallSide
  readonly stretches: readonly WallFaceStretch[]
}

export interface PlanRoom extends Room {
  /** Each wall face that has a stretch along this room, once. */
  readonly faces: readonly { readonly wallId: string; readonly side: WallSide }[]
}

const SIDES: readonly WallSide[] = ['positive', 'negative']

/** What one face's stretches are cut from. */
interface FaceContext {
  readonly path: WallPath
  readonly roomsBesideEdge: readonly EdgeSideRooms[]
}

/**
 * The room on one side of an edge. The graph keeps each edge in its wall's direction, so the
 * positive side of the wall is the left of the edge.
 */
function roomOnSide(rooms: EdgeSideRooms | undefined, side: WallSide): number | undefined {
  return side === 'positive' ? rooms?.left : rooms?.right
}

/**
 * The stretches of one face over the wall's edges, in order from its start. Neighbors with the
 * same room join when their edges meet.
 */
function faceStretches(
  edges: readonly NetworkEdge[],
  side: WallSide,
  context: FaceContext,
): WallFaceStretch[] {
  const alongOf = (point: Point): number => projectOntoPath(context.path, point).along
  return edges.reduce<WallFaceStretch[]>((stretches, edge, index) => {
    const roomIndex = roomOnSide(context.roomsBesideEdge[edge.index], side)
    const previous = stretches[stretches.length - 1]
    const toMm = alongOf(edge.path.end)
    if (
      previous !== undefined &&
      previous.roomIndex === roomIndex &&
      edges[index - 1]?.to === edge.from
    ) {
      stretches[stretches.length - 1] = { ...previous, toMm }
    } else {
      stretches.push({ fromMm: alongOf(edge.path.start), toMm, roomIndex })
    }
    return stretches
  }, [])
}

/** True for an edge from a junction to itself, which bounds no stretch of a wall face. */
export function isLoopEdge(edge: NetworkEdge): boolean {
  return edge.from === edge.to
}

/**
 * The network's edges, grouped by the id of their wall, each group in network order. An edge
 * from a junction to itself bounds no stretch, so it is left out.
 */
function edgesByWallId(edges: readonly NetworkEdge[]): Map<string, NetworkEdge[]> {
  const byWallId = new Map<string, NetworkEdge[]>()
  for (const edge of edges) {
    if (isLoopEdge(edge)) continue
    const group = byWallId.get(edge.wallId)
    if (group === undefined) byWallId.set(edge.wallId, [edge])
    else group.push(edge)
  }
  return byWallId
}

/** Both faces of every wall of the network, in wall order, from what its face walk found. */
export function wallFaceRecords(
  network: Pick<WallNetwork, 'walls' | 'edges'>,
  walk: RoomWalk,
): WallFaceRecord[] {
  const edgesOfWall = edgesByWallId(network.edges)
  return network.walls.flatMap((wall) => {
    const edges = edgesOfWall.get(wall.id) ?? []
    const context = { path: wall.path, roomsBesideEdge: walk.roomsBesideEdge }
    return SIDES.map((side) => ({
      wallId: wall.id,
      side,
      stretches: faceStretches(edges, side, context),
    }))
  })
}

/** The walk's rooms, each with the wall faces that bound it. */
export function planRoomsOf(rooms: readonly Room[], faces: readonly WallFaceRecord[]): PlanRoom[] {
  const facesOfRoom = rooms.map((): PlanRoom['faces'][number][] => [])
  for (const { wallId, side, stretches } of faces) {
    for (const roomIndex of new Set(stretches.map((stretch) => stretch.roomIndex))) {
      if (roomIndex !== undefined) facesOfRoom[roomIndex]?.push({ wallId, side })
    }
  }
  return rooms.map((room, roomIndex) => ({ ...room, faces: facesOfRoom[roomIndex] ?? [] }))
}
