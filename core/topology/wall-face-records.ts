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
  readonly junctions: readonly Point[]
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
 * same room join.
 */
function faceStretches(
  edges: readonly NetworkEdge[],
  side: WallSide,
  context: FaceContext,
): WallFaceStretch[] {
  const stretches: { fromMm: number; toMm: number; roomIndex: number | undefined }[] = []
  for (const edge of edges) {
    const roomIndex = roomOnSide(context.roomsBesideEdge[edge.index], side)
    const alongOf = (junction: number): number =>
      projectOntoPath(context.path, context.junctions[junction] as Point).along
    const previous = stretches[stretches.length - 1]
    if (previous !== undefined && previous.roomIndex === roomIndex) previous.toMm = alongOf(edge.to)
    else stretches.push({ fromMm: alongOf(edge.from), toMm: alongOf(edge.to), roomIndex })
  }
  return stretches
}

/** Both faces of every wall of the network, in wall order, from what its face walk found. */
export function wallFaceRecords(
  network: Pick<WallNetwork, 'walls' | 'junctions' | 'edges'>,
  walk: RoomWalk,
): WallFaceRecord[] {
  return network.walls.flatMap((wall) => {
    const edges = network.edges.filter((edge) => edge.wallId === wall.id)
    const context = {
      path: wall.path,
      junctions: network.junctions,
      roomsBesideEdge: walk.roomsBesideEdge,
    }
    return SIDES.map((side) => ({
      wallId: wall.id,
      side,
      stretches: faceStretches(edges, side, context),
    }))
  })
}

/** The walk's rooms, each with the wall faces that bound it. */
export function planRoomsOf(rooms: readonly Room[], faces: readonly WallFaceRecord[]): PlanRoom[] {
  return rooms.map((room, roomIndex) => ({
    ...room,
    faces: faces
      .filter((face) => face.stretches.some((stretch) => stretch.roomIndex === roomIndex))
      .map(({ wallId, side }) => ({ wallId, side })),
  }))
}
