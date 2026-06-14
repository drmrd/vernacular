import * as THREE from 'three'
import { expect } from 'vitest'

import type { OpeningSceneNode, PlanarGraph, Vector3, WallSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups, readIndex, readPositions } from '../testing'

import { COMPONENTS_PER_VERTEX } from './geometry-utils'
import { buildWalls } from './wall-builder'

export const THICKNESS = 120
export const HALF_THICKNESS = THICKNESS / 2
export const HEIGHT = 2600
export const WALL_LENGTH = 4000
export const SPLIT_X = 2000
export const VOID_WIDTH = 900
export const VOID_HEIGHT = 2032
export const WALL_FACE_AREA = WALL_LENGTH * HEIGHT // 10_400_000
export const VOID_AREA = VOID_WIDTH * VOID_HEIGHT // 1_828_800
export const CUT_FACE_AREA = WALL_FACE_AREA - VOID_AREA // 8_571_200
export const FACE_GROUP_COUNT = 6
export const PRECISION = 3
export const AREA_TOLERANCE = 10
const TRIANGLE_STRIDE = 9 // 3 vertices x 3 (x, y, z) components

export const FULL_THICKNESS_SPAN: [number, number] = [-HALF_THICKNESS, HALF_THICKNESS]

export const meshesOf = (group: THREE.Group): THREE.Mesh[] =>
  group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)

// Sum of the drawn triangle areas in a flat [x, y, z, ...] array, taking
// vertices three at a time. Each triangle's area is half the magnitude of the
// cross-product of its two edge vectors out of the first vertex.
const triangleAreaSum = (positions: ArrayLike<number>): number => {
  let total = 0
  for (let i = 0; i + TRIANGLE_STRIDE <= positions.length; i += TRIANGLE_STRIDE) {
    const at = (vertex: number, axis: number): number =>
      positions[i + vertex * COMPONENTS_PER_VERTEX + axis] ?? 0
    const [ax, ay, az] = [at(1, 0) - at(0, 0), at(1, 1) - at(0, 1), at(1, 2) - at(0, 2)]
    const [bx, by, bz] = [at(2, 0) - at(0, 0), at(2, 1) - at(0, 1), at(2, 2) - at(0, 2)]
    total += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2
  }
  return total
}

// A material group's `start`/`count` index the index buffer when the geometry
// is indexed, and the position attribute directly when it is not. Resolve the
// named role's drawn triangle vertices either way before measuring their area.
// Returns 0 when no group carries the role (the role's faces are absent).
export const roleArea = (mesh: THREE.Mesh, role: string): number => {
  const geometry = mesh.geometry as THREE.BufferGeometry
  const materials = mesh.material as THREE.Material[]
  const group = materialGroups(geometry).find((g) => materials[g.materialIndex]?.name === role)
  if (group === undefined) return 0
  const positions = readPositions(geometry)
  const index = readIndex(geometry)
  const drawn =
    index.length > 0
      ? index.slice(group.start, group.start + group.count).map((vi) => positions[vi])
      : positions.slice(group.start, group.start + group.count)
  return triangleAreaSum(drawn.flatMap((v) => (v ? [v.x, v.y, v.z] : [])))
}

// The drawn vertices of every material group carrying the named role.
const roleDrawnPoints = (mesh: THREE.Mesh, role: string): Vector3[] => {
  const geometry = mesh.geometry as THREE.BufferGeometry
  const materials = mesh.material as THREE.Material[]
  const positions = readPositions(geometry)
  const index = readIndex(geometry)
  return materialGroups(geometry)
    .filter((group) => materials[group.materialIndex]?.name === role)
    .flatMap((group) =>
      index.length > 0
        ? index.slice(group.start, group.start + group.count).map((vi) => positions[vi])
        : positions.slice(group.start, group.start + group.count),
    )
    .filter((point): point is Vector3 => point !== undefined)
}

// The largest value on one axis among a role's drawn vertices.
export const maxAxisOfRole = (mesh: THREE.Mesh, role: string, axis: 'x' | 'y' | 'z'): number =>
  Math.max(...roleDrawnPoints(mesh, role).map((point) => point[axis]))

// The set of surface roles drawn by a mesh's material groups.
export const drawnRolesOf = (mesh: THREE.Mesh): Set<string | undefined> => {
  const materials = mesh.material as THREE.Material[]
  return new Set(materialGroups(mesh.geometry).map((group) => materials[group.materialIndex]?.name))
}

// Assert a mesh's world bounding box spans the given [min, max] per axis.
export const expectBoxSpan = (
  mesh: THREE.Mesh,
  span: { x: [number, number]; y: [number, number]; z: [number, number] },
): void => {
  const aabb = new THREE.Box3().setFromObject(mesh)
  expect(aabb.min.x).toBeCloseTo(span.x[0], PRECISION)
  expect(aabb.max.x).toBeCloseTo(span.x[1], PRECISION)
  expect(aabb.min.y).toBeCloseTo(span.y[0], PRECISION)
  expect(aabb.max.y).toBeCloseTo(span.y[1], PRECISION)
  expect(aabb.min.z).toBeCloseTo(span.z[0], PRECISION)
  expect(aabb.max.z).toBeCloseTo(span.z[1], PRECISION)
}

// A horizontal wall along +x from the origin, hosting id `wall:w1`.
export const horizontalWall = (over: Partial<WallSceneNode> = {}): WallSceneNode => ({
  id: 'wall:w1',
  kind: 'wall',
  floorId: 'demo',
  start: { x: 0, y: 0 },
  end: { x: WALL_LENGTH, y: 0 },
  thickness: THICKNESS,
  height: HEIGHT,
  ...over,
})

export const oneEdgeGraph = (): PlanarGraph => ({
  vertices: [
    { x: 0, y: 0 },
    { x: WALL_LENGTH, y: 0 },
  ],
  edges: [{ a: 0, b: 1, wallId: 'w1' }],
})

// The same wall split at SPLIT_X into two edges, both carrying wall id `w1`.
export const splitEdgeGraph = (): PlanarGraph => ({
  vertices: [
    { x: 0, y: 0 },
    { x: SPLIT_X, y: 0 },
    { x: WALL_LENGTH, y: 0 },
  ],
  edges: [
    { a: 0, b: 1, wallId: 'w1' },
    { a: 1, b: 2, wallId: 'w1' },
  ],
})

// Builds the floor's walls from one horizontal wall and the given openings.
export const wallGroup = (
  openings: OpeningSceneNode[] = [],
  graph: PlanarGraph = oneEdgeGraph(),
): THREE.Group =>
  buildWalls({
    graph,
    walls: [horizontalWall()],
    openingsByWall:
      openings.length > 0 ? new Map<string, OpeningSceneNode[]>([['w1', openings]]) : new Map(),
    materials: new NeutralMaterialProvider(),
  })

// The single `wall:w1` mesh from a horizontal wall hosting the given openings.
export const singleWallMesh = (openings: OpeningSceneNode[] = []): THREE.Mesh | undefined =>
  meshesOf(wallGroup(openings)).find((m) => m.userData.entityId === 'wall:w1')

// A void centered on the host wall. The sill height sets door (0) versus
// raised-sill window behavior; the defaults give a single-swing door.
export const centeredOpening = (over: Partial<OpeningSceneNode> = {}): OpeningSceneNode => ({
  id: 'opening:o1',
  kind: 'opening',
  floorId: 'demo',
  type: 'single-swing-door',
  hostWallId: 'w1',
  center: { x: SPLIT_X, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: VOID_WIDTH,
  height: VOID_HEIGHT,
  sillHeight: 0,
  hostThickness: THICKNESS,
  orientation: { hinge: 'start', facing: 'positive' },
  ...over,
})
