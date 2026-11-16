import * as THREE from 'three'

import { planToWorld } from '../../core'
import type { OpeningSceneNode, Point, Vector3, WallSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups, readIndex, readNormals, readPositions } from '../testing'

import { buildWalls } from './wall-builder'

// Shared helpers for the face winding tests: read a built mesh back as world-space
// triangles, judge each triangle against the direction out of the wall material,
// and turn the tallies into one report line per face class that points inward.
// The layout helpers build walls on one planar graph and classify their faces.

const VERTICES_PER_TRIANGLE = 3
/** A winding cross product shorter than this belongs to a zero-area triangle. */
const DEGENERATE_CROSS_LENGTH = 1e-6

/** Which reading of a triangle a report counts: its winding or its vertex normals. */
export type Measure = 'windingInward' | 'vertexNormalsInward'

/** One drawn triangle in world space, with its unit winding normal and centroid. */
export interface WorldTriangle {
  readonly corners: readonly THREE.Vector3[]
  readonly vertexNormals: readonly THREE.Vector3[]
  readonly centroid: THREE.Vector3
  readonly winding: THREE.Vector3
}

/** The face class a triangle belongs to and the direction out of the material there. */
export interface FaceJudgement<C extends string> {
  readonly faceClass: C
  readonly outward: THREE.Vector3
}

export interface Tally {
  total: number
  windingInward: number
  vertexNormalsInward: number
}

/** What to report: a case label, the face classes that must be built, and the readings. */
export interface ReportRequest<C extends string> {
  readonly label: string
  readonly classes: readonly C[]
  readonly measures: readonly Measure[]
}

/** A range of drawn vertices, as a material group gives it. */
interface DrawRange {
  readonly start: number
  readonly count: number
}

export const toThree = (v: Vector3): THREE.Vector3 => new THREE.Vector3(v.x, v.y, v.z)

/** A plan point at a height, in world space through the single axis map. */
export const worldAt = (plan: Point, height: number): THREE.Vector3 =>
  toThree(planToWorld(plan, height))

/** A unit plan direction as a unit world direction. */
export const worldDirection = (direction: Point): THREE.Vector3 =>
  worldAt(direction, 0)
    .sub(worldAt({ x: 0, y: 0 }, 0))
    .normalize()

const triangleOf = (
  corners: THREE.Vector3[],
  vertexNormals: THREE.Vector3[],
): WorldTriangle | null => {
  const [a, b, c] = corners
  if (a === undefined || b === undefined || c === undefined) return null
  const cross = b.clone().sub(a).cross(c.clone().sub(a))
  if (cross.length() < DEGENERATE_CROSS_LENGTH) return null
  const centroid = a.clone().add(b).add(c).divideScalar(VERTICES_PER_TRIANGLE)
  return { corners, vertexNormals, centroid, winding: cross.normalize() }
}

/**
 * Every drawn, non-degenerate triangle of a mesh in world space, in the index order
 * as built. A draw range limits the read to one material group.
 */
export const worldTriangles = (mesh: THREE.Mesh, range?: DrawRange): WorldTriangle[] => {
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
  const positions = readPositions(mesh.geometry).map((p) =>
    toThree(p).applyMatrix4(mesh.matrixWorld),
  )
  const normals = readNormals(mesh.geometry).map((n) => toThree(n).applyMatrix3(normalMatrix))
  const index = readIndex(mesh.geometry)
  const drawn = index.length > 0 ? index : positions.map((_, vertex) => vertex)
  const order = range === undefined ? drawn : drawn.slice(range.start, range.start + range.count)
  const triangles: WorldTriangle[] = []
  for (let i = 0; i + VERTICES_PER_TRIANGLE <= order.length; i += VERTICES_PER_TRIANGLE) {
    const ids = order.slice(i, i + VERTICES_PER_TRIANGLE)
    const triangle = triangleOf(
      ids.map((id) => positions[id] ?? new THREE.Vector3()),
      ids.map((id) => normals[id] ?? new THREE.Vector3()),
    )
    if (triangle !== null) triangles.push(triangle)
  }
  return triangles
}

/** The world triangles of every material group of a mesh drawn with the named role. */
export const roleTriangles = (mesh: THREE.Mesh, role: string): WorldTriangle[] => {
  const materials = mesh.material as THREE.Material[]
  return materialGroups(mesh.geometry)
    .filter((group) => materials[group.materialIndex]?.name === role)
    .flatMap((group) => worldTriangles(mesh, group))
}

/** Tallies triangles per face class, counting those that wind or shade inward. */
export const tallyFaces = <C extends string>(
  triangles: readonly WorldTriangle[],
  judge: (triangle: WorldTriangle) => FaceJudgement<C>,
): Map<C, Tally> => {
  const tallies = new Map<C, Tally>()
  for (const triangle of triangles) {
    const { faceClass, outward } = judge(triangle)
    const tally = tallies.get(faceClass) ?? { total: 0, windingInward: 0, vertexNormalsInward: 0 }
    tally.total += 1
    if (triangle.winding.dot(outward) <= 0) tally.windingInward += 1
    const disagrees = triangle.vertexNormals.some(
      (n) => n.dot(triangle.winding) <= 0 || n.dot(outward) <= 0,
    )
    if (disagrees) tally.vertexNormalsInward += 1
    tallies.set(faceClass, tally)
  }
  return tallies
}

const MEASURE_WORDING: Record<Measure, string> = {
  windingInward: 'wind inward',
  vertexNormalsInward: 'carry inward vertex normals',
}

/**
 * One line per requested face class that was not built at all, and per class and
 * reading with inward triangles. An empty report means every class passed.
 */
export const inwardLines = <C extends string>(
  tallies: ReadonlyMap<C, Tally>,
  request: ReportRequest<C>,
): string[] =>
  request.classes.flatMap((faceClass) => {
    const tally = tallies.get(faceClass)
    const label = `${request.label}, ${faceClass}`
    if (tally === undefined) return [`${label}: no triangles were built`]
    return request.measures.flatMap((measure) => {
      const inward = tally[measure]
      if (inward === 0) return []
      return [`${label}: ${inward} of ${tally.total} triangles ${MEASURE_WORDING[measure]}`]
    })
  })

/** mm: every layout wall is built this thick and this tall. */
export const LAYOUT_WALL_THICKNESS = 120
export const LAYOUT_WALL_HEIGHT = 2600
/** The class of a wall triangle that fits no named face. */
export const OTHER_FACE = 'other face'
const HALF_THICKNESS = LAYOUT_WALL_THICKNESS / 2
const HALF = 0.5
/** A unit winding normal with an up component below this belongs to a vertical face. */
const VERTICAL_UP_TOLERANCE = 1e-3
/** A unit normal within this of a unit axis is aligned with it. */
const ALIGNED_TOLERANCE = 1e-3
/** mm: a centroid this close to a face line, an opening edge, or a cap lies on it. */
const POSITION_TOLERANCE_MM = 1

/** One opening of a layout wall: its element type and its place along the wall. */
export interface OpeningSpec {
  readonly name: string
  readonly type: string
  readonly at: number
  readonly width: number
  readonly height: number
  readonly sill: number
}

/** One layout wall in plan, with the openings cut in it. */
export interface WallSpec {
  readonly id: string
  readonly start: Point
  readonly end: Point
  readonly openings: readonly OpeningSpec[]
}

interface Hole {
  readonly name: string
  readonly from: number
  readonly to: number
  readonly bottom: number
  readonly top: number
  readonly center: THREE.Vector3
}

/** A wall's world frame and the openings cut in it, read from its plan spec. */
interface WallFrame {
  readonly startWorld: THREE.Vector3
  readonly alongWorld: THREE.Vector3
  readonly acrossWorld: THREE.Vector3
  readonly solidCenter: THREE.Vector3
  readonly holes: readonly Hole[]
}

const unitAlong = ({ start, end }: WallSpec): Point => {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  return { x: (end.x - start.x) / length, y: (end.y - start.y) / length }
}

const pointAlong = (wall: WallSpec, at: number): Point => {
  const along = unitAlong(wall)
  return { x: wall.start.x + along.x * at, y: wall.start.y + along.y * at }
}

const holeOf = (wall: WallSpec, opening: OpeningSpec): Hole => ({
  name: opening.name,
  from: opening.at - opening.width * HALF,
  to: opening.at + opening.width * HALF,
  bottom: opening.sill,
  top: opening.sill + opening.height,
  center: worldAt(pointAlong(wall, opening.at), opening.sill + opening.height * HALF),
})

const frameOf = (wall: WallSpec): WallFrame => {
  const along = unitAlong(wall)
  const midPlan = { x: (wall.start.x + wall.end.x) * HALF, y: (wall.start.y + wall.end.y) * HALF }
  return {
    startWorld: worldAt(wall.start, 0),
    alongWorld: worldDirection(along),
    acrossWorld: worldDirection({ x: -along.y, y: along.x }),
    solidCenter: worldAt(midPlan, LAYOUT_WALL_HEIGHT * HALF),
    holes: wall.openings.map((opening) => holeOf(wall, opening)),
  }
}

const openingNode = (wall: WallSpec, opening: OpeningSpec): OpeningSceneNode => {
  const along = unitAlong(wall)
  return {
    id: `opening:${wall.id}:${opening.name}`,
    kind: 'opening',
    floorId: 'demo',
    type: opening.type,
    hostWallId: wall.id,
    center: pointAlong(wall, opening.at),
    along,
    normal: { x: -along.y, y: along.x },
    width: opening.width,
    height: opening.height,
    sillHeight: opening.sill,
    hostThickness: LAYOUT_WALL_THICKNESS,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

const wallNode = (wall: WallSpec): WallSceneNode => ({
  id: `wall:${wall.id}`,
  kind: 'wall',
  floorId: 'demo',
  start: wall.start,
  end: wall.end,
  thickness: LAYOUT_WALL_THICKNESS,
  height: LAYOUT_WALL_HEIGHT,
})

/**
 * Builds the walls on one shared planar graph, one wall node per spec, so walls
 * meeting at a vertex are mitred and a junction of three or more walls is filled.
 */
export const buildLayout = (walls: readonly WallSpec[]): THREE.Group => {
  const vertices: Point[] = []
  const vertexOf = (point: Point): number => {
    const found = vertices.findIndex((v) => v.x === point.x && v.y === point.y)
    return found >= 0 ? found : vertices.push(point) - 1
  }
  const edges = walls.map((wall) => ({
    a: vertexOf(wall.start),
    b: vertexOf(wall.end),
    wallId: wall.id,
  }))
  const group = buildWalls({
    graph: { vertices, edges },
    walls: walls.map(wallNode),
    openingsByWall: new Map(
      walls.map((wall) => [wall.id, wall.openings.map((opening) => openingNode(wall, opening))]),
    ),
    materials: new NeutralMaterialProvider(),
  })
  group.updateMatrixWorld(true)
  return group
}

const isNear = (value: number, target: number): boolean =>
  Math.abs(value - target) < POSITION_TOLERANCE_MM

const isWithin = (value: number, low: number, high: number): boolean =>
  value > low - POSITION_TOLERANCE_MM && value < high + POSITION_TOLERANCE_MM

// The opening whose void holds a centroid inside the wall thickness, if any.
const holeAt = (frame: WallFrame, centroid: THREE.Vector3): Hole | undefined => {
  const offset = centroid.clone().sub(frame.startWorld)
  const along = offset.dot(frame.alongWorld)
  if (Math.abs(offset.dot(frame.acrossWorld)) > HALF_THICKNESS - POSITION_TOLERANCE_MM) {
    return undefined
  }
  return frame.holes.find(
    (hole) => isWithin(along, hole.from, hole.to) && isWithin(centroid.y, hole.bottom, hole.top),
  )
}

const revealClass = (hole: Hole, { centroid, winding }: WorldTriangle): string => {
  const up = Math.abs(winding.y)
  if (up < VERTICAL_UP_TOLERANCE) return `jamb (${hole.name})`
  if (up < 1 - ALIGNED_TOLERANCE) return `curved head (${hole.name})`
  return isNear(centroid.y, hole.bottom) ? `sill (${hole.name})` : `head (${hole.name})`
}

// Classifies a triangle by geometry alone, then names the direction out of the
// material there: a reveal faces its opening's center, any other face points away
// from the center of the wall solid (inside the convex hull of a mitred prism).
const judgeWallFace =
  (frame: WallFrame) =>
  (triangle: WorldTriangle): FaceJudgement<string> => {
    const { centroid, winding } = triangle
    const awayFromSolid = centroid.clone().sub(frame.solidCenter)
    const vertical = Math.abs(winding.y) < VERTICAL_UP_TOLERANCE
    const across = Math.abs(centroid.clone().sub(frame.startWorld).dot(frame.acrossWorld))
    const hole = holeAt(frame, centroid)
    if (!vertical && (isNear(centroid.y, 0) || isNear(centroid.y, LAYOUT_WALL_HEIGHT))) {
      return { faceClass: 'top or bottom cap', outward: awayFromSolid }
    }
    if (vertical && isNear(across, HALF_THICKNESS)) {
      return { faceClass: 'long face', outward: awayFromSolid }
    }
    if (hole !== undefined) {
      return { faceClass: revealClass(hole, triangle), outward: hole.center.clone().sub(centroid) }
    }
    if (!vertical) return { faceClass: OTHER_FACE, outward: awayFromSolid }
    const square = Math.abs(winding.dot(frame.alongWorld)) > 1 - ALIGNED_TOLERANCE
    return { faceClass: square ? 'end cap' : 'mitred end cap', outward: awayFromSolid }
  }

/**
 * Tallies the faces of one layout wall per face class: long face, end cap, mitred
 * end cap, top or bottom cap, and per opening its jambs, sill, head, or curved head.
 */
export const wallTallies = (group: THREE.Group, wall: WallSpec): Map<string, Tally> => {
  const meshes = group.children.filter(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh && child.userData.entityId === `wall:${wall.id}`,
  )
  const triangles = meshes.flatMap((mesh) => worldTriangles(mesh))
  return tallyFaces(triangles, judgeWallFace(frameOf(wall)))
}
