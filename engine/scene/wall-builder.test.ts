import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallMesh, buildWalls } from './wall-builder'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups, readIndex, readNormals, readPositions } from '../testing'
import type { OpeningSceneNode, PlanarGraph, Vector3, WallSceneNode } from '../../core'

const THICKNESS = 120
const HALF_THICKNESS = THICKNESS / 2
const HEIGHT = 2600
const WALL_LENGTH = 4000
const SPLIT_X = 2000
const VOID_WIDTH = 900
const VOID_HEIGHT = 2032
const WALL_FACE_AREA = WALL_LENGTH * HEIGHT // 10_400_000
const VOID_AREA = VOID_WIDTH * VOID_HEIGHT // 1_828_800
const CUT_FACE_AREA = WALL_FACE_AREA - VOID_AREA // 8_571_200
const FACE_GROUP_COUNT = 6
const PRECISION = 3
const AREA_TOLERANCE = 10
const TRIANGLE_STRIDE = 9 // 3 vertices x 3 (x, y, z) components

const meshesOf = (group: THREE.Group): THREE.Mesh[] =>
  group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)

// Sum of the drawn triangle areas in a flat [x, y, z, ...] array, taking
// vertices three at a time. Each triangle's area is half the magnitude of the
// cross-product of its two edge vectors out of the first vertex.
const triangleAreaSum = (positions: ArrayLike<number>): number => {
  let total = 0
  for (let i = 0; i + TRIANGLE_STRIDE <= positions.length; i += TRIANGLE_STRIDE) {
    const at = (vertex: number, axis: number): number => positions[i + vertex * 3 + axis] ?? 0
    const [ax, ay, az] = [at(1, 0) - at(0, 0), at(1, 1) - at(0, 1), at(1, 2) - at(0, 2)]
    const [bx, by, bz] = [at(2, 0) - at(0, 0), at(2, 1) - at(0, 1), at(2, 2) - at(0, 2)]
    total += 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)
  }
  return total
}

// A material group's `start`/`count` index the index buffer when the geometry
// is indexed, and the position attribute directly when it is not. Resolve the
// named role's drawn triangle vertices either way before measuring their area.
// Returns 0 when no group carries the role (the role's faces are absent).
const roleArea = (mesh: THREE.Mesh, role: string): number => {
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

// The set of surface roles drawn by a mesh's material groups.
const drawnRolesOf = (mesh: THREE.Mesh): Set<string | undefined> => {
  const materials = mesh.material as THREE.Material[]
  return new Set(materialGroups(mesh.geometry).map((group) => materials[group.materialIndex]?.name))
}

// Assert a mesh's world bounding box spans the given [min, max] per axis.
const expectBoxSpan = (
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

const FULL_THICKNESS_SPAN: [number, number] = [-HALF_THICKNESS, HALF_THICKNESS]

// A horizontal wall along +x from the origin, hosting id `wall:w1`.
const horizontalWall = (over: Partial<WallSceneNode> = {}): WallSceneNode => ({
  id: 'wall:w1',
  kind: 'wall',
  floorId: 'demo',
  start: { x: 0, y: 0 },
  end: { x: WALL_LENGTH, y: 0 },
  thickness: THICKNESS,
  height: HEIGHT,
  ...over,
})

const oneEdgeGraph = (): PlanarGraph => ({
  vertices: [
    { x: 0, y: 0 },
    { x: WALL_LENGTH, y: 0 },
  ],
  edges: [{ a: 0, b: 1, wallId: 'w1' }],
})

// The same wall split at SPLIT_X into two edges, both carrying wall id `w1`.
const splitEdgeGraph = (): PlanarGraph => ({
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
const wallGroup = (
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
const singleWallMesh = (openings: OpeningSceneNode[] = []): THREE.Mesh | undefined =>
  meshesOf(wallGroup(openings)).find((m) => m.userData.entityId === 'wall:w1')

// A void centered on the host wall. The sill height sets door (0) versus
// raised-sill window behavior; the defaults give a single-swing door.
const centeredOpening = (over: Partial<OpeningSceneNode> = {}): OpeningSceneNode => ({
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

describe('buildWallMesh', () => {
  it('extrudes a wall as a box centered on its centerline with its base on the floor datum', () => {
    const mesh = buildWallMesh(horizontalWall(), new NeutralMaterialProvider())

    expect(mesh).toBeInstanceOf(THREE.Mesh)
    expect(mesh.userData.entityId).toBe('wall:w1')
    expectBoxSpan(mesh, { x: [0, WALL_LENGTH], y: [0, HEIGHT], z: FULL_THICKNESS_SPAN })
  })

  it('groups its faces into per-surface materials covering the four shell roles and every triangle', () => {
    const mesh = buildWallMesh(horizontalWall(), new NeutralMaterialProvider())
    const geometry = mesh.geometry as THREE.BufferGeometry
    const drawnRoles = drawnRolesOf(mesh)

    expect([...drawnRoles].sort()).toEqual(['base', 'exteriorFace', 'interiorFace', 'top'])
    expect(drawnRoles.has('reveal')).toBe(false)

    const groups = materialGroups(geometry)
    const index = readIndex(geometry)
    const totalTriangleVertices = index.length > 0 ? index.length : readPositions(geometry).length
    const coveredTriangleVertices = groups.reduce((sum, group) => sum + group.count, 0)
    expect(coveredTriangleVertices).toBe(totalTriangleVertices)
  })

  it('winds its faces so role normals tie to the foundation orientation rule', () => {
    // Horizontal wall: the builder's world-Y rotation is zero, so the geometry's
    // local normals equal world normals and reading the normal attribute is valid.
    const mesh = buildWallMesh(horizontalWall(), new NeutralMaterialProvider())
    const geometry = mesh.geometry as THREE.BufferGeometry
    const materials = mesh.material as THREE.Material[]
    const groups = materialGroups(geometry)
    const index = readIndex(geometry)
    const normals = readNormals(geometry)

    const precision = 5
    const roleNormal = (role: string): Vector3 | undefined => {
      const group = groups.find((g) => materials[g.materialIndex]?.name === role)
      if (group === undefined) return undefined
      const vertexIndex = index[group.start]
      return vertexIndex === undefined ? undefined : normals[vertexIndex]
    }

    expect(roleNormal('top')?.y).toBeCloseTo(1, precision)
    expect(roleNormal('base')?.y).toBeCloseTo(-1, precision)

    const interior = roleNormal('interiorFace') ?? { x: 0, y: 0, z: 0 }
    // The long face carries a horizontal normal: y is flat, pointing along x or z.
    expect(interior.y).toBeCloseTo(0, precision)
    expect(Math.hypot(interior.x, interior.z)).toBeCloseTo(1, precision)

    // The two long faces are oppositely wound: some face normal is the exact opposite.
    const opposite = { x: -interior.x, y: -interior.y, z: -interior.z }
    const matches = (a: Vector3, b: Vector3): boolean =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-5
    expect(normals.some((n) => matches(n, opposite))).toBe(true)
  })
})

describe('buildWalls', () => {
  it('builds a single box for an unsplit wall with no openings', () => {
    const meshes = meshesOf(wallGroup())
    expect(meshes).toHaveLength(1)

    const mesh = meshes[0]
    expect(mesh).toBeDefined()
    if (mesh === undefined) return
    expect(mesh.userData.entityId).toBe('wall:w1')
    expect(materialGroups(mesh.geometry)).toHaveLength(FACE_GROUP_COUNT)
    expectBoxSpan(mesh, { x: [0, WALL_LENGTH], y: [0, HEIGHT], z: FULL_THICKNESS_SPAN })
  })

  it('builds one box per edge for a split wall, both carrying the wall node id', () => {
    const meshes = meshesOf(wallGroup([], splitEdgeGraph()))
    expect(meshes).toHaveLength(2)
    expect(meshes.every((mesh) => mesh.userData.entityId === 'wall:w1')).toBe(true)

    const [first, second] = meshes.sort(
      (left, right) =>
        new THREE.Box3().setFromObject(left).min.x - new THREE.Box3().setFromObject(right).min.x,
    )
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) return

    expectBoxSpan(first, { x: [0, SPLIT_X], y: [0, HEIGHT], z: FULL_THICKNESS_SPAN })
    expectBoxSpan(second, { x: [SPLIT_X, WALL_LENGTH], y: [0, HEIGHT], z: FULL_THICKNESS_SPAN })
  })
})

describe('buildWalls opening voids', () => {
  it('cuts the opening void out of the wall long faces', () => {
    const mesh = singleWallMesh([centeredOpening()])
    expect(mesh).toBeDefined()
    if (mesh === undefined) return
    expect(Math.abs(roleArea(mesh, 'interiorFace') - CUT_FACE_AREA)).toBeLessThan(AREA_TOLERANCE)
  })

  it('leaves the long faces solid when the wall has no openings', () => {
    const mesh = singleWallMesh()
    expect(mesh).toBeDefined()
    if (mesh === undefined) return
    expect(Math.abs(roleArea(mesh, 'interiorFace') - WALL_FACE_AREA)).toBeLessThan(AREA_TOLERANCE)
  })
})

describe('buildWalls opening reveals', () => {
  it('lines a sill-zero door void with reveals on the head and jambs but not the floor sill', () => {
    const mesh = singleWallMesh([centeredOpening({ sillHeight: 0 })])
    expect(mesh).toBeDefined()
    if (mesh === undefined) return

    // Head plus two jambs lined; the floor-level sill is on the wall base and is
    // not lined: (width + 2 * height) * thickness.
    const expectedReveal = (VOID_WIDTH + 2 * VOID_HEIGHT) * THICKNESS // 595_680
    expect(Math.abs(roleArea(mesh, 'reveal') - expectedReveal)).toBeLessThan(AREA_TOLERANCE)
  })

  it('lines all four edges of a raised-sill window void, including the sill', () => {
    const windowWidth = 900
    const windowHeight = 1200
    const mesh = singleWallMesh([
      centeredOpening({
        id: 'opening:w1',
        type: 'double-hung-window',
        width: windowWidth,
        height: windowHeight,
        sillHeight: 900,
      }),
    ])
    expect(mesh).toBeDefined()
    if (mesh === undefined) return

    // A raised sill is lined too: (2 * width + 2 * height) * thickness.
    const expectedReveal = (2 * windowWidth + 2 * windowHeight) * THICKNESS // 504_000
    expect(Math.abs(roleArea(mesh, 'reveal') - expectedReveal)).toBeLessThan(AREA_TOLERANCE)
  })
})
