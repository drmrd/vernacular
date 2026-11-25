import { projectOntoPath, type WallPath } from '../geometry/wall-path'
import type { Point } from '../model/types'
import type { RoomWalk } from './room-walk'
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

/** The half-edge twinned with this one: edge `i` makes half-edges `2i` and `2i + 1`. */
function twinOf(halfEdge: number): number {
  return halfEdge % 2 === 0 ? halfEdge + 1 : halfEdge - 1
}

/** The room of the face whose outline holds a half-edge, among the faces that became rooms. */
function walkedRoomOf(walk: RoomWalk, halfEdge: number): number | undefined {
  const face = walk.outlineFaceOfHalfEdge[halfEdge]
  return face === undefined ? undefined : walk.roomOfFace.get(face)
}

/**
 * The room along each half-edge. A face that became no room and runs around rooms that the hole
 * pass gave to a container (the outer cycle of a free-standing group of walls) bounds that
 * container. A half-edge outside every outline bounds no room.
 */
function roomOfEachHalfEdge(walk: RoomWalk): (number | undefined)[] {
  const roomOfFace = new Map(walk.roomOfFace)
  walk.outlineFaceOfHalfEdge.forEach((face, halfEdge) => {
    const twinRoom = walkedRoomOf(walk, twinOf(halfEdge))
    const container = twinRoom === undefined ? undefined : walk.containerOfRoom[twinRoom]
    if (face !== undefined && !roomOfFace.has(face) && container !== undefined) {
      roomOfFace.set(face, container)
    }
  })
  return walk.outlineFaceOfHalfEdge.map((face) =>
    face === undefined ? undefined : roomOfFace.get(face),
  )
}

/** What one face's stretches are cut from. */
interface FaceContext {
  readonly path: WallPath
  readonly junctions: readonly Point[]
  readonly roomOfHalfEdge: readonly (number | undefined)[]
}

/**
 * The stretches of one face over the wall's edges, in order from its start. The graph keeps each
 * edge in its wall's direction, so half-edge `2i` runs from start to end and its face lies on
 * the positive side. Neighbors with the same room join.
 */
function faceStretches(
  edges: readonly NetworkEdge[],
  side: WallSide,
  context: FaceContext,
): WallFaceStretch[] {
  const stretches: { fromMm: number; toMm: number; roomIndex: number | undefined }[] = []
  for (const edge of edges) {
    const halfEdge = side === 'positive' ? 2 * edge.index : 2 * edge.index + 1
    const roomIndex = context.roomOfHalfEdge[halfEdge]
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
  const roomOfHalfEdge = roomOfEachHalfEdge(walk)
  return network.walls.flatMap((wall) => {
    const edges = network.edges.filter((edge) => edge.wallId === wall.id)
    const context = { path: wall.path, junctions: network.junctions, roomOfHalfEdge }
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
