import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { planToWorld } from '../../core'
import type { OpeningSceneNode, Point, Vector3, WallSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { readIndex, readNormals, readPositions } from '../testing'

import { buildWalls } from './wall-builder'

// Face culling and the shadow pass both read a triangle's winding, so every face
// of a wall solid must be wound to point out of the solid: the long faces and end
// caps away from the wall body, the reveals of an opening into the opening.

const WALL_THICKNESS = 120
const WALL_HEIGHT = 2600
const AXIS_WALL_LENGTH = 4000
// A 3-4-5 run and rise, so the diagonal wall is as long as the axis walls.
const DIAGONAL_RUN = 2400
const DIAGONAL_RISE = 3200
const WINDOW_WIDTH = 900
const WINDOW_HEIGHT = 1200
const WINDOW_SILL_HEIGHT = 900
const HALF = 0.5
/** A unit winding normal with an up component below this belongs to a vertical face. */
const VERTICAL_UP_TOLERANCE = 1e-3
/** A vertical face this aligned with the wall axis is an end cap or an opening jamb. */
const ALONG_AXIS_ALIGNMENT = 0.5
/** mm: a centroid this close to a wall end, the floor, or the wall top lies on it. */
const POSITION_TOLERANCE_MM = 1
/** A winding cross product shorter than this belongs to a zero-area triangle. */
const DEGENERATE_CROSS_LENGTH = 1e-6
const VERTICES_PER_TRIANGLE = 3
const ORIGIN: Point = { x: 0, y: 0 }

type FaceClass = 'long face' | 'end cap' | 'reveal' | 'top cap' | 'bottom cap'
type Measure = 'windingInward' | 'vertexNormalsInward'
type BuildPath = 'plain prism' | 'opening'

interface WallCase {
  readonly name: string
  readonly end: Point
}

const WALL_CASES: readonly WallCase[] = [
  { name: 'along-x', end: { x: AXIS_WALL_LENGTH, y: 0 } },
  { name: 'along-z', end: { x: 0, y: AXIS_WALL_LENGTH } },
  { name: 'diagonal', end: { x: DIAGONAL_RUN, y: DIAGONAL_RISE } },
]

/** The wall's world frame, derived from the plan through the single axis map. */
interface WallFrame {
  readonly wall: WallCase
  readonly length: number
  readonly alongPlan: Point
  readonly midPlan: Point
  readonly startWorld: THREE.Vector3
  readonly alongWorld: THREE.Vector3
  readonly solidCenter: THREE.Vector3
  readonly voidCenter: THREE.Vector3
}

interface Tally {
  total: number
  windingInward: number
  vertexNormalsInward: number
}

const toThree = (v: Vector3): THREE.Vector3 => new THREE.Vector3(v.x, v.y, v.z)

const frameOf = (wall: WallCase): WallFrame => {
  const length = Math.hypot(wall.end.x, wall.end.y)
  const alongPlan = { x: wall.end.x / length, y: wall.end.y / length }
  const midPlan = { x: wall.end.x * HALF, y: wall.end.y * HALF }
  const startWorld = toThree(planToWorld(ORIGIN, 0))
  return {
    wall,
    length,
    alongPlan,
    midPlan,
    startWorld,
    alongWorld: toThree(planToWorld(alongPlan, 0)).sub(startWorld).normalize(),
    solidCenter: toThree(planToWorld(midPlan, WALL_HEIGHT * HALF)),
    voidCenter: toThree(planToWorld(midPlan, WINDOW_SILL_HEIGHT + WINDOW_HEIGHT * HALF)),
  }
}

// A raised-sill window centered on the wall, so its void has jambs, a head, and a sill.
const centeredWindow = (frame: WallFrame): OpeningSceneNode => ({
  id: `opening:${frame.wall.name}`,
  kind: 'opening',
  floorId: 'demo',
  type: 'double-hung-window',
  hostWallId: frame.wall.name,
  center: frame.midPlan,
  along: frame.alongPlan,
  normal: { x: -frame.alongPlan.y, y: frame.alongPlan.x },
  width: WINDOW_WIDTH,
  height: WINDOW_HEIGHT,
  sillHeight: WINDOW_SILL_HEIGHT,
  hostThickness: WALL_THICKNESS,
  orientation: { hinge: 'start', facing: 'positive' },
})

const buildWallMeshes = (frame: WallFrame, path: BuildPath): THREE.Mesh[] => {
  const { wall } = frame
  const node: WallSceneNode = {
    id: `wall:${wall.name}`,
    kind: 'wall',
    floorId: 'demo',
    start: ORIGIN,
    end: wall.end,
    thickness: WALL_THICKNESS,
    height: WALL_HEIGHT,
  }
  const group = buildWalls({
    graph: { vertices: [ORIGIN, wall.end], edges: [{ a: 0, b: 1, wallId: wall.name }] },
    walls: [node],
    openingsByWall:
      path === 'opening' ? new Map([[wall.name, [centeredWindow(frame)]]]) : new Map(),
    materials: new NeutralMaterialProvider(),
  })
  group.updateMatrixWorld(true)
  return group.children.filter(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh && child.userData.entityId === node.id,
  )
}

interface Triangle {
  readonly corners: THREE.Vector3[]
  readonly vertexNormals: THREE.Vector3[]
}

// Every drawn triangle in world space, in the index order as built.
const trianglesOf = (mesh: THREE.Mesh): Triangle[] => {
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
  const positions = readPositions(mesh.geometry).map((p) =>
    toThree(p).applyMatrix4(mesh.matrixWorld),
  )
  const normals = readNormals(mesh.geometry).map((n) => toThree(n).applyMatrix3(normalMatrix))
  const index = readIndex(mesh.geometry)
  const order = index.length > 0 ? index : positions.map((_, vertex) => vertex)
  const triangles: Triangle[] = []
  for (let i = 0; i + VERTICES_PER_TRIANGLE <= order.length; i += VERTICES_PER_TRIANGLE) {
    const ids = order.slice(i, i + VERTICES_PER_TRIANGLE)
    const corners = ids.map((id) => positions[id] ?? new THREE.Vector3())
    const vertexNormals = ids.map((id) => normals[id] ?? new THREE.Vector3())
    triangles.push({ corners, vertexNormals })
  }
  return triangles
}

const isNear = (value: number, target: number): boolean =>
  Math.abs(value - target) < POSITION_TOLERANCE_MM

// Classifies a triangle by geometry alone: horizontal faces at the floor or wall
// top are caps, other horizontal faces are a head or sill; vertical faces facing
// across the wall are long faces, and those facing along it are end caps at the
// wall ends and jambs elsewhere.
const classify = (frame: WallFrame, centroid: THREE.Vector3, winding: THREE.Vector3): FaceClass => {
  if (Math.abs(winding.y) >= VERTICAL_UP_TOLERANCE) {
    if (isNear(centroid.y, 0)) return 'bottom cap'
    return isNear(centroid.y, WALL_HEIGHT) ? 'top cap' : 'reveal'
  }
  if (Math.abs(winding.dot(frame.alongWorld)) < ALONG_AXIS_ALIGNMENT) return 'long face'
  const along = centroid.clone().sub(frame.startWorld).dot(frame.alongWorld)
  return isNear(along, 0) || isNear(along, frame.length) ? 'end cap' : 'reveal'
}

// The direction "out of the solid" for a face: a reveal faces the void center; every
// other face faces away from the center of the wall solid.
const outwardOf = (
  frame: WallFrame,
  faceClass: FaceClass,
  centroid: THREE.Vector3,
): THREE.Vector3 =>
  faceClass === 'reveal'
    ? frame.voidCenter.clone().sub(centroid)
    : centroid.clone().sub(frame.solidCenter)

const tallyWall = (frame: WallFrame, path: BuildPath): Map<FaceClass, Tally> => {
  const tallies = new Map<FaceClass, Tally>()
  for (const { corners, vertexNormals } of buildWallMeshes(frame, path).flatMap(trianglesOf)) {
    const [a, b, c] = corners
    if (a === undefined || b === undefined || c === undefined) continue
    const cross = b.clone().sub(a).cross(c.clone().sub(a))
    if (cross.length() < DEGENERATE_CROSS_LENGTH) continue
    const winding = cross.normalize()
    const centroid = a.clone().add(b).add(c).divideScalar(VERTICES_PER_TRIANGLE)
    const faceClass = classify(frame, centroid, winding)
    const outward = outwardOf(frame, faceClass, centroid)
    const tally = tallies.get(faceClass) ?? { total: 0, windingInward: 0, vertexNormalsInward: 0 }
    tally.total += 1
    if (winding.dot(outward) <= 0) tally.windingInward += 1
    const disagrees = vertexNormals.some((n) => n.dot(winding) <= 0 || n.dot(outward) <= 0)
    if (disagrees) tally.vertexNormalsInward += 1
    tallies.set(faceClass, tally)
  }
  return tallies
}

// One line per wall and face class that has inward triangles (or none built at all).
const inwardReport = (path: BuildPath, classes: readonly FaceClass[], measure: Measure): string[] =>
  WALL_CASES.flatMap((wall) => {
    const tallies = tallyWall(frameOf(wall), path)
    return classes.flatMap((faceClass) => {
      const tally = tallies.get(faceClass)
      const label = `${wall.name} wall (${path} path), ${faceClass}`
      if (tally === undefined) return [`${label}: no triangles were built`]
      const inward = tally[measure]
      return inward === 0 ? [] : [`${label}: ${inward} of ${tally.total} triangles point inward`]
    })
  })

describe('wall face winding', () => {
  it('winds every long face and end cap of a plain wall away from the wall solid', () => {
    expect(inwardReport('plain prism', ['long face', 'end cap'], 'windingInward')).toEqual([])
  })

  it('winds every long face and end cap of a wall with an opening away from the wall solid', () => {
    expect(inwardReport('opening', ['long face', 'end cap'], 'windingInward')).toEqual([])
  })

  it('winds every reveal of a window opening into the opening', () => {
    expect(inwardReport('opening', ['reveal'], 'windingInward')).toEqual([])
  })

  it('gives each wall-face vertex a normal that agrees with an outward winding', () => {
    const report = [
      ...inwardReport('plain prism', ['long face', 'end cap'], 'vertexNormalsInward'),
      ...inwardReport('opening', ['long face', 'end cap', 'reveal'], 'vertexNormalsInward'),
    ]
    expect(report).toEqual([])
  })

  it('keeps the top and bottom caps facing away from the wall solid on both build paths', () => {
    const caps: readonly FaceClass[] = ['top cap', 'bottom cap']
    const report = [
      ...inwardReport('plain prism', caps, 'windingInward'),
      ...inwardReport('opening', caps, 'windingInward'),
      ...inwardReport('plain prism', caps, 'vertexNormalsInward'),
      ...inwardReport('opening', caps, 'vertexNormalsInward'),
    ]
    expect(report).toEqual([])
  })
})
