import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallMesh, buildWalls } from './wall-builder'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups, readIndex, readNormals, readPositions } from '../testing'
import type { OpeningSceneNode, PlanarGraph, Vector3, WallSceneNode } from '../../core'

const meshesOf = (group: THREE.Group): THREE.Mesh[] =>
  group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)

const TRIANGLE_STRIDE = 9 // 3 vertices x 3 (x, y, z) components

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

const THICKNESS = 120
const HEIGHT = 2600
const WALL_LENGTH = 4000
const VOID_WIDTH = 900
const VOID_HEIGHT = 2032
const WALL_FACE_AREA = WALL_LENGTH * HEIGHT // 10_400_000
const VOID_AREA = VOID_WIDTH * VOID_HEIGHT // 1_828_800
const CUT_FACE_AREA = WALL_FACE_AREA - VOID_AREA // 8_571_200

const interiorFaceArea = (mesh: THREE.Mesh): number => {
  const geometry = mesh.geometry as THREE.BufferGeometry
  const materials = mesh.material as THREE.Material[]
  const group = materialGroups(geometry).find(
    (g) => materials[g.materialIndex]?.name === 'interiorFace',
  )
  expect(group).toBeDefined()
  return roleArea(mesh, 'interiorFace')
}

const horizontalWallGraph = (): PlanarGraph => ({
  vertices: [
    { x: 0, y: 0 },
    { x: WALL_LENGTH, y: 0 },
  ],
  edges: [{ a: 0, b: 1, wallId: 'w1' }],
})

const horizontalWall = (): WallSceneNode => ({
  id: 'wall:w1',
  kind: 'wall',
  floorId: 'demo',
  start: { x: 0, y: 0 },
  end: { x: WALL_LENGTH, y: 0 },
  thickness: THICKNESS,
  height: HEIGHT,
})

// The single wall mesh from a horizontal wall hosting the given opening.
const wallMeshWithOpening = (opening: OpeningSceneNode): THREE.Mesh | undefined => {
  const group = buildWalls({
    graph: horizontalWallGraph(),
    walls: [horizontalWall()],
    openingsByWall: new Map<string, OpeningSceneNode[]>([['w1', [opening]]]),
    materials: new NeutralMaterialProvider(),
  })
  return meshesOf(group).find((m) => m.userData.entityId === 'wall:w1')
}

// A void centered on the host wall. The sill height sets door (0) versus
// raised-sill window behavior; the defaults give a single-swing door.
const centeredOpening = (over: Partial<OpeningSceneNode> = {}): OpeningSceneNode => ({
  id: 'opening:o1',
  kind: 'opening',
  floorId: 'demo',
  type: 'single-swing-door',
  hostWallId: 'w1',
  center: { x: 2000, y: 0 },
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
    const wallLength = 2000
    const thickness = 120
    const height = 2400
    const halfThickness = thickness / 2

    const node: WallSceneNode = {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: wallLength, y: 0 },
      thickness,
      height,
    }

    const mesh = buildWallMesh(node, new NeutralMaterialProvider())

    expect(mesh).toBeInstanceOf(THREE.Mesh)
    expect(mesh.userData.entityId).toBe('wall:w1')

    const precision = 3
    const aabb = new THREE.Box3().setFromObject(mesh)
    expect(aabb.min.x).toBeCloseTo(0, precision)
    expect(aabb.max.x).toBeCloseTo(wallLength, precision)
    expect(aabb.min.y).toBeCloseTo(0, precision)
    expect(aabb.max.y).toBeCloseTo(height, precision)
    expect(aabb.min.z).toBeCloseTo(-halfThickness, precision)
    expect(aabb.max.z).toBeCloseTo(halfThickness, precision)
  })

  it('groups its faces into per-surface materials covering the four shell roles and every triangle', () => {
    const node: WallSceneNode = {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
      thickness: 120,
      height: 2400,
    }

    const mesh = buildWallMesh(node, new NeutralMaterialProvider())
    const geometry = mesh.geometry as THREE.BufferGeometry

    expect(Array.isArray(mesh.material)).toBe(true)
    const materials = mesh.material as THREE.Material[]

    const groups = materialGroups(geometry)
    const drawnRoles = new Set(groups.map((group) => materials[group.materialIndex]?.name))

    expect([...drawnRoles].sort()).toEqual(['base', 'exteriorFace', 'interiorFace', 'top'])
    expect(drawnRoles.has('reveal')).toBe(false)

    const index = readIndex(geometry)
    const totalTriangleVertices = index.length > 0 ? index.length : readPositions(geometry).length
    const coveredTriangleVertices = groups.reduce((sum, group) => sum + group.count, 0)
    expect(coveredTriangleVertices).toBe(totalTriangleVertices)
  })

  it('winds its faces so role normals tie to the foundation orientation rule', () => {
    // Horizontal wall: the builder's world-Y rotation is zero, so the geometry's
    // local normals equal world normals and reading the normal attribute is valid.
    const node: WallSceneNode = {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
      thickness: 120,
      height: 2400,
    }

    const mesh = buildWallMesh(node, new NeutralMaterialProvider())
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

    const top = roleNormal('top')
    expect(top).toBeDefined()
    expect(top?.x).toBeCloseTo(0, precision)
    expect(top?.y).toBeCloseTo(1, precision)
    expect(top?.z).toBeCloseTo(0, precision)

    const base = roleNormal('base')
    expect(base).toBeDefined()
    expect(base?.x).toBeCloseTo(0, precision)
    expect(base?.y).toBeCloseTo(-1, precision)
    expect(base?.z).toBeCloseTo(0, precision)

    const interior = roleNormal('interiorFace')
    expect(interior).toBeDefined()
    const interiorNormal = interior ?? { x: 0, y: 0, z: 0 }
    // The long face carries a horizontal normal: y is flat, and it points along x or z.
    expect(interiorNormal.y).toBeCloseTo(0, precision)
    expect(Math.hypot(interiorNormal.x, interiorNormal.z)).toBeCloseTo(1, precision)

    // The two long faces are oppositely wound: some face normal is the exact opposite.
    const opposite = { x: -interiorNormal.x, y: -interiorNormal.y, z: -interiorNormal.z }
    const matches = (a: Vector3, b: Vector3): boolean =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-5
    expect(normals.some((n) => matches(n, opposite))).toBe(true)
  })
})

describe('buildWalls', () => {
  const THICKNESS = 120
  const HALF_THICKNESS = THICKNESS / 2
  const HEIGHT = 2600
  const FACE_GROUP_COUNT = 6

  it('builds a single box for an unsplit wall with no openings', () => {
    const graph: PlanarGraph = {
      vertices: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
      ],
      edges: [{ a: 0, b: 1, wallId: 'w1' }],
    }
    const walls: WallSceneNode[] = [
      {
        id: 'wall:w1',
        kind: 'wall',
        floorId: 'demo',
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
        thickness: THICKNESS,
        height: HEIGHT,
      },
    ]
    const openingsByWall = new Map<string, OpeningSceneNode[]>()

    const group = buildWalls({
      graph,
      walls,
      openingsByWall,
      materials: new NeutralMaterialProvider(),
    })

    expect(group).toBeInstanceOf(THREE.Group)
    const meshes = meshesOf(group)
    expect(meshes).toHaveLength(1)

    const mesh = meshes[0]
    expect(mesh).toBeDefined()
    if (mesh === undefined) return
    expect(mesh.userData.entityId).toBe('wall:w1')

    const geometry = mesh.geometry as THREE.BufferGeometry
    expect(materialGroups(geometry)).toHaveLength(FACE_GROUP_COUNT)

    const precision = 3
    const aabb = new THREE.Box3().setFromObject(mesh)
    expect(aabb.min.x).toBeCloseTo(0, precision)
    expect(aabb.max.x).toBeCloseTo(4000, precision)
    expect(aabb.min.y).toBeCloseTo(0, precision)
    expect(aabb.max.y).toBeCloseTo(HEIGHT, precision)
    expect(aabb.min.z).toBeCloseTo(-HALF_THICKNESS, precision)
    expect(aabb.max.z).toBeCloseTo(HALF_THICKNESS, precision)
  })

  it('builds one box per edge for a split wall, both carrying the wall node id', () => {
    const graph: PlanarGraph = {
      vertices: [
        { x: 0, y: 0 },
        { x: 2000, y: 0 },
        { x: 4000, y: 0 },
      ],
      edges: [
        { a: 0, b: 1, wallId: 'w1' },
        { a: 1, b: 2, wallId: 'w1' },
      ],
    }
    const walls: WallSceneNode[] = [
      {
        id: 'wall:w1',
        kind: 'wall',
        floorId: 'demo',
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
        thickness: THICKNESS,
        height: HEIGHT,
      },
    ]
    const openingsByWall = new Map<string, OpeningSceneNode[]>()

    const group = buildWalls({
      graph,
      walls,
      openingsByWall,
      materials: new NeutralMaterialProvider(),
    })

    const meshes = meshesOf(group)
    expect(meshes).toHaveLength(2)
    expect(meshes.every((mesh) => mesh.userData.entityId === 'wall:w1')).toBe(true)

    const precision = 3
    const spans = meshes
      .map((mesh) => new THREE.Box3().setFromObject(mesh))
      .sort((left, right) => left.min.x - right.min.x)

    const [first, second] = spans
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) return

    expect(first.min.x).toBeCloseTo(0, precision)
    expect(first.max.x).toBeCloseTo(2000, precision)
    expect(first.min.y).toBeCloseTo(0, precision)
    expect(first.max.y).toBeCloseTo(HEIGHT, precision)
    expect(first.min.z).toBeCloseTo(-HALF_THICKNESS, precision)
    expect(first.max.z).toBeCloseTo(HALF_THICKNESS, precision)

    expect(second.min.x).toBeCloseTo(2000, precision)
    expect(second.max.x).toBeCloseTo(4000, precision)
    expect(second.min.y).toBeCloseTo(0, precision)
    expect(second.max.y).toBeCloseTo(HEIGHT, precision)
    expect(second.min.z).toBeCloseTo(-HALF_THICKNESS, precision)
    expect(second.max.z).toBeCloseTo(HALF_THICKNESS, precision)
  })
})

describe('buildWalls opening voids', () => {
  it('cuts the opening void out of the wall long faces', () => {
    const opening: OpeningSceneNode = {
      id: 'opening:o1',
      kind: 'opening',
      floorId: 'demo',
      type: 'single-swing-door',
      hostWallId: 'w1',
      center: { x: 2000, y: 0 },
      along: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      width: VOID_WIDTH,
      height: VOID_HEIGHT,
      sillHeight: 0,
      hostThickness: THICKNESS,
      orientation: { hinge: 'start', facing: 'positive' },
    }

    const group = buildWalls({
      graph: horizontalWallGraph(),
      walls: [horizontalWall()],
      openingsByWall: new Map<string, OpeningSceneNode[]>([['w1', [opening]]]),
      materials: new NeutralMaterialProvider(),
    })

    const mesh = meshesOf(group).find((m) => m.userData.entityId === 'wall:w1')
    expect(mesh).toBeDefined()
    if (mesh === undefined) return
    const area = interiorFaceArea(mesh)
    const tolerance = 10
    expect(Math.abs(area - CUT_FACE_AREA)).toBeLessThan(tolerance)
  })

  it('leaves the long faces solid when the wall has no openings', () => {
    const group = buildWalls({
      graph: horizontalWallGraph(),
      walls: [horizontalWall()],
      openingsByWall: new Map<string, OpeningSceneNode[]>(),
      materials: new NeutralMaterialProvider(),
    })
    const mesh = meshesOf(group).find((m) => m.userData.entityId === 'wall:w1')
    expect(mesh).toBeDefined()
    if (mesh === undefined) return
    expect(Math.abs(interiorFaceArea(mesh) - WALL_FACE_AREA)).toBeLessThan(10)
  })
})

describe('buildWalls opening reveals', () => {
  it('lines a sill-zero door void with reveals on the head and jambs but not the floor sill', () => {
    const mesh = wallMeshWithOpening(centeredOpening({ sillHeight: 0 }))
    expect(mesh).toBeDefined()
    if (mesh === undefined) return

    // Head plus two jambs lined; the floor-level sill is on the wall base and is
    // not lined: (width + 2 * height) * thickness.
    const expectedReveal = (VOID_WIDTH + 2 * VOID_HEIGHT) * THICKNESS // 595_680
    expect(Math.abs(roleArea(mesh, 'reveal') - expectedReveal)).toBeLessThan(10)
  })

  it('lines all four edges of a raised-sill window void, including the sill', () => {
    const windowWidth = 900
    const windowHeight = 1200
    const mesh = wallMeshWithOpening(
      centeredOpening({
        id: 'opening:w1',
        type: 'double-hung-window',
        width: windowWidth,
        height: windowHeight,
        sillHeight: 900,
      }),
    )
    expect(mesh).toBeDefined()
    if (mesh === undefined) return

    // A raised sill is lined too: (2 * width + 2 * height) * thickness.
    const expectedReveal = (2 * windowWidth + 2 * windowHeight) * THICKNESS // 504_000
    expect(Math.abs(roleArea(mesh, 'reveal') - expectedReveal)).toBeLessThan(10)
  })
})
