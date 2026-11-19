import * as THREE from 'three'
import { exteriorWalls, type Floor, type SceneGraph } from '../../core'
import { nodesOf } from '../../core/scene/wall-runs-test-fixtures'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { buildScene } from './build-scene'
import {
  prepareNearWallTransparency,
  updateNearWallTransparency,
  type NearWallTarget,
} from './near-wall-transparency'
import { enrollNearWallTargets } from './near-wall-transparency-enrollment'
import { WALL_SPAN_KEY, type WallSpan } from './wall-span'

/** The opacity a material sits at once the near-wall fade has faded it. */
export const FADED_OPACITY = 0.1

/** A wall mesh seen through what a fade test asserts: its recorded span and whether it is faded. */
export interface Piece {
  span: WallSpan | undefined
  faded: boolean
}

/** The scene graph of a one-floor fixture `floor`, with no underlays, dimensions, stairs or furniture. */
export const sceneGraphOf = (floor: Floor): SceneGraph => ({
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
  ...nodesOf(floor),
  underlays: [],
  dimensions: [],
  stairs: [],
  furniture: [],
})

/** The scene of `floor` with the near-wall fade applied for a camera at `camera`. */
export function fadedScene(floor: Floor, camera: { x: number; z: number }): THREE.Group {
  const graph = sceneGraphOf(floor)
  const root = buildScene(graph, new NeutralMaterialProvider())
  updateNearWallTransparency(enrollNearWallTargets(root, graph), camera)
  return root
}

/** True when some material of a mesh at or under `object` sits at the faded opacity. */
export function isFaded(object: THREE.Object3D): boolean {
  let faded = false
  object.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return
    const materials: THREE.Material[] = Array.isArray(part.material)
      ? part.material
      : [part.material]
    faded ||= materials.some((material) => material.opacity === FADED_OPACITY)
  })
  return faded
}

/** The meshes of the wall `entityId` with their recorded span and whether each is faded, by start. */
export function piecesOf(root: THREE.Object3D, entityId: string): Piece[] {
  const pieces: Piece[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.entityId === entityId) {
      pieces.push({
        span: object.userData[WALL_SPAN_KEY] as WallSpan | undefined,
        faded: isFaded(object),
      })
    }
  })
  return pieces.sort((a, b) => (a.span?.fromMm ?? 0) - (b.span?.fromMm ?? 0))
}

/**
 * A camera outside the bottom wall of the door room: that wall fades. In world space it
 * stands at positive z, the open-air side of the door wall (the door wall is at z = 0).
 */
export const CAMERA_OUTSIDE = { x: 2000, z: 3000 }

/**
 * A camera inside the door room, on the bottom wall's inner side: that wall restores. In
 * world space it stands at negative z, the room side of the door wall (plan y maps to world -z).
 */
export const CAMERA_INSIDE = { x: 2000, z: -3000 }

/** A camera outside the bottom and the right wall at once: both fade. */
export const CAMERA_OUTSIDE_CORNER = { x: 6000, z: 3000 }

const ROOM_SIDE_MM = 4000
const WALL_THICKNESS_MM = 200
const WALL_HEIGHT_MM = 2400
const WINDOW_HEIGHT_MM = 1200
const WINDOW_SILL_MM = 900

type Point = { x: number; y: number }

const SOUTH_WEST: Point = { x: 0, y: 0 }
const SOUTH_EAST: Point = { x: ROOM_SIDE_MM, y: 0 }
const NORTH_EAST: Point = { x: ROOM_SIDE_MM, y: ROOM_SIDE_MM }
const NORTH_WEST: Point = { x: 0, y: ROOM_SIDE_MM }
const roomCorners = [SOUTH_WEST, SOUTH_EAST, NORTH_EAST, NORTH_WEST]

const wallBetween = (id: string, start: Point, end: Point): SceneGraph['walls'][number] => ({
  id: `wall:${id}`,
  kind: 'wall',
  floorId: 'g',
  start,
  end,
  thickness: WALL_THICKNESS_MM,
  height: WALL_HEIGHT_MM,
})

const doorInBottomWall: SceneGraph['openings'][number] = {
  id: 'opening:door',
  kind: 'opening',
  floorId: 'g',
  type: 'single-swing-door',
  center: { x: 2000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: 900,
  height: 2032,
  sillHeight: 0,
  hostThickness: WALL_THICKNESS_MM,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'bottom',
}

/** A square room ringed by four exterior walls, with a single swing door in the bottom wall. */
export const roomWithDoorGraph = (): SceneGraph => ({
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
  walls: [
    wallBetween('bottom', SOUTH_WEST, SOUTH_EAST),
    wallBetween('right', SOUTH_EAST, NORTH_EAST),
    wallBetween('top', NORTH_EAST, NORTH_WEST),
    wallBetween('left', NORTH_WEST, SOUTH_WEST),
  ],
  rooms: [
    {
      id: 'room:r1',
      kind: 'room',
      floorId: 'g',
      polygon: roomCorners,
      clearPolygon: roomCorners,
      area: ROOM_SIDE_MM * ROOM_SIDE_MM,
      ceilingHeight: WALL_HEIGHT_MM,
    },
  ],
  underlays: [],
  openings: [doorInBottomWall],
  dimensions: [],
  stairs: [],
  furniture: [],
})

/** The door room with a double-hung window in its bottom wall instead of the door. */
export const roomWithWindowGraph = (): SceneGraph => ({
  ...roomWithDoorGraph(),
  openings: [
    {
      ...doorInBottomWall,
      id: 'opening:window',
      type: 'double-hung-window',
      height: WINDOW_HEIGHT_MM,
      sillHeight: WINDOW_SILL_MM,
    },
  ],
})

/** The enrolled fade targets of `graph`, every material at its solid baseline. */
export function enrolledTargetsOf(graph: SceneGraph): NearWallTarget[] {
  const root = buildScene(graph, new NeutralMaterialProvider())
  return prepareNearWallTransparency(root, exteriorWalls(graph.walls, graph.rooms, graph.openings))
}

/** The enrolled fade targets of the door room, every material at its solid baseline. */
export const enrolledDoorRoomTargets = (): NearWallTarget[] =>
  enrolledTargetsOf(roomWithDoorGraph())

/** A material with the two flags the fade writes and the version the renderer reads. */
export interface MaterialState {
  material: THREE.Material
  transparent: boolean
  depthWrite: boolean
  version: number
}

/** The state of each distinct material the targets own, read now. */
export function materialStatesOf(targets: NearWallTarget[]): MaterialState[] {
  const materials = new Set(targets.flatMap((target) => target.materials.map((m) => m.material)))
  return [...materials].map((material) => ({
    material,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    version: material.version,
  }))
}

/** True when the material's `transparent` or `depthWrite` now differs from `before`. */
export const drawFlagsChanged = (before: MaterialState): boolean =>
  before.material.transparent !== before.transparent ||
  before.material.depthWrite !== before.depthWrite

/** True when the material's version is the one `before` recorded. */
export const versionUnchanged = (before: MaterialState): boolean =>
  before.material.version === before.version
