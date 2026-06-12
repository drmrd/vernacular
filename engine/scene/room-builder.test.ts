import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildRoomShell } from './room-builder'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups, readIndex, readNormals, readPositions } from '../testing'
import { floorSlabThickness } from '../../core'
import type { RoomSceneNode, Vector3 } from '../../core'

const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const CEILING_HEIGHT = 2600
const PRECISION = 3
const PRECISION_5 = 5
const FLOOR_DATUM_Y = 0
const ORIGIN = 0

const HOLE_MIN = 1000
const HOLE_MAX = 2000
const HOLE_CENTROID = { x: 1500, z: 1500 }
const RING_SAMPLE = { x: 500, z: 500 }

const RECTANGLE = [
  { x: ORIGIN, y: ORIGIN },
  { x: ROOM_WIDTH, y: ORIGIN },
  { x: ROOM_WIDTH, y: ROOM_DEPTH },
  { x: ORIGIN, y: ROOM_DEPTH },
]

const HOLE = [
  { x: HOLE_MIN, y: HOLE_MIN },
  { x: HOLE_MAX, y: HOLE_MIN },
  { x: HOLE_MAX, y: HOLE_MAX },
  { x: HOLE_MIN, y: HOLE_MAX },
]

interface Point2D {
  x: number
  z: number
}

interface Triangle2D {
  a: Point2D
  b: Point2D
  c: Point2D
}

// Barycentric-style containment via consistent signs of the edge cross products.
// The cap sample points sit well inside or outside their triangles, so the
// Float32 geometry precision does not put any of them on an edge.
function pointInTriangle2D(p: Point2D, triangle: Triangle2D): boolean {
  const cross = (o: Point2D, u: Point2D, v: Point2D): number =>
    (u.x - o.x) * (v.z - o.z) - (u.z - o.z) * (v.x - o.x)
  const d1 = cross(p, triangle.a, triangle.b)
  const d2 = cross(p, triangle.b, triangle.c)
  const d3 = cross(p, triangle.c, triangle.a)
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNegative && hasPositive)
}

function rectangularRoom(overrides: Partial<RoomSceneNode> = {}): RoomSceneNode {
  return {
    id: 'room:r1',
    kind: 'room',
    floorId: 'g',
    polygon: RECTANGLE,
    clearPolygon: RECTANGLE,
    area: ROOM_WIDTH * ROOM_DEPTH,
    ...overrides,
  }
}

function meshesOf(group: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })
  return meshes
}

// The floor slab is the only surface carrying an upward `top` cap.
function findFloorSlab(group: THREE.Object3D): THREE.Mesh | undefined {
  return meshesOf(group).find(
    (mesh) =>
      Array.isArray(mesh.material) && mesh.material.some((material) => material.name === 'top'),
  )
}

// The slab geometry is non-indexed, so a material group's triangles are the
// positions in [start, start + count) taken three vertices at a time. A
// top-cap vertex at world (x, 0, z) maps back to plan point (x, z).
function topCapTriangles(mesh: THREE.Mesh): Triangle2D[] {
  const geometry = mesh.geometry as THREE.BufferGeometry
  const materials = mesh.material as THREE.Material[]
  const cap = materialGroups(geometry).find((g) => materials[g.materialIndex]?.name === 'top')
  if (cap === undefined) return []

  const capPoints: Point2D[] = readPositions(geometry)
    .slice(cap.start, cap.start + cap.count)
    .map((vertex) => ({ x: vertex.x, z: vertex.z }))

  const triangles: Triangle2D[] = []
  const verticesPerTriangle = 3
  for (let i = 0; i + verticesPerTriangle <= capPoints.length; i += verticesPerTriangle) {
    const [a, b, c] = capPoints.slice(i, i + verticesPerTriangle)
    if (a !== undefined && b !== undefined && c !== undefined) triangles.push({ a, b, c })
  }
  return triangles
}

describe('buildRoomShell', () => {
  it('returns a room group carrying the room id with a floor slab hanging below the finished floor', () => {
    const node = rectangularRoom()

    const group = buildRoomShell(node, new NeutralMaterialProvider())

    expect(group).toBeInstanceOf(THREE.Group)
    expect(group.name).toBe('room:r1')
    expect(group.userData.entityId).toBe('room:r1')

    // Measure the floor slab specifically (the group also holds the ceiling),
    // selecting it as the only surface that carries an upward `top` cap.
    const slab = meshesOf(group).find(
      (mesh) =>
        Array.isArray(mesh.material) && mesh.material.some((material) => material.name === 'top'),
    )
    expect(slab).toBeDefined()

    const aabb = new THREE.Box3().setFromObject(slab as THREE.Mesh)
    expect(aabb.min.x).toBeCloseTo(ORIGIN, PRECISION)
    expect(aabb.max.x).toBeCloseTo(ROOM_WIDTH, PRECISION)
    expect(aabb.min.z).toBeCloseTo(ORIGIN, PRECISION)
    expect(aabb.max.z).toBeCloseTo(ROOM_DEPTH, PRECISION)
    expect(aabb.max.y).toBeCloseTo(FLOOR_DATUM_Y, PRECISION)
    expect(aabb.min.y).toBeCloseTo(-floorSlabThickness(), PRECISION)
  })

  it('groups the floor slab faces into top, base, and exteriorFace surfaces covering every triangle', () => {
    const node = rectangularRoom()

    const group = buildRoomShell(node, new NeutralMaterialProvider())

    const meshes = meshesOf(group)

    // A later cycle adds a ceiling mesh to the same group, so select the floor
    // slab as the only surface that carries an upward `top` cap.
    const slab = meshes.find(
      (mesh) =>
        Array.isArray(mesh.material) && mesh.material.some((material) => material.name === 'top'),
    )
    expect(slab).toBeDefined()
    const slabMesh = slab as THREE.Mesh

    const geometry = slabMesh.geometry as THREE.BufferGeometry
    const materials = slabMesh.material as THREE.Material[]

    const groups = materialGroups(geometry)
    const drawnRoles = new Set(groups.map((g) => materials[g.materialIndex]?.name))

    expect([...drawnRoles].sort()).toEqual(['base', 'exteriorFace', 'top'])
    expect(drawnRoles.has('reveal')).toBe(false)

    const index = readIndex(geometry)
    const totalTriangleVertices = index.length > 0 ? index.length : readPositions(geometry).length
    const coveredTriangleVertices = groups.reduce((sum, g) => sum + g.count, 0)
    expect(coveredTriangleVertices).toBe(totalTriangleVertices)
  })

  it('winds the floor slab faces so role normals tie to the foundation orientation rule', () => {
    const node = rectangularRoom()

    const group = buildRoomShell(node, new NeutralMaterialProvider())

    const meshes = meshesOf(group)

    // A later cycle adds a ceiling mesh to the same group, so select the floor
    // slab as the only surface that carries an upward `top` cap.
    const slab = meshes.find(
      (mesh) =>
        Array.isArray(mesh.material) && mesh.material.some((material) => material.name === 'top'),
    )
    expect(slab).toBeDefined()
    const slabMesh = slab as THREE.Mesh

    const geometry = slabMesh.geometry as THREE.BufferGeometry
    const materials = slabMesh.material as THREE.Material[]

    const groups = materialGroups(geometry)
    const normals = readNormals(geometry)

    // The slab geometry is non-indexed, so a group's `start` is a vertex offset
    // directly and the first vertex's normal stands for the role's facing.
    const roleNormal = (role: string): Vector3 | undefined => {
      const matched = groups.find((g) => materials[g.materialIndex]?.name === role)
      return matched === undefined ? undefined : normals[matched.start]
    }

    const top = roleNormal('top')
    expect(top).toBeDefined()
    expect(top?.x).toBeCloseTo(0, PRECISION_5)
    expect(top?.y).toBeCloseTo(1, PRECISION_5)
    expect(top?.z).toBeCloseTo(0, PRECISION_5)

    const base = roleNormal('base')
    expect(base).toBeDefined()
    expect(base?.x).toBeCloseTo(0, PRECISION_5)
    expect(base?.y).toBeCloseTo(-1, PRECISION_5)
    expect(base?.z).toBeCloseTo(0, PRECISION_5)

    const side = roleNormal('exteriorFace')
    expect(side).toBeDefined()
    const sideNormal = side ?? { x: 0, y: 0, z: 0 }
    // The vertical sides carry a horizontal normal: y is flat, pointing along x or z.
    expect(sideNormal.y).toBeCloseTo(0, PRECISION_5)
    expect(Math.hypot(sideNormal.x, sideNormal.z)).toBeCloseTo(1, PRECISION_5)
  })

  it('hangs a downward-facing base-role ceiling plane over the room at the ceiling height', () => {
    const node = rectangularRoom({ ceilingHeight: CEILING_HEIGHT })

    const group = buildRoomShell(node, new NeutralMaterialProvider())

    const meshes = meshesOf(group)

    // The floor slab sits at roughly y in [-250, 0]; the ceiling is the only
    // surface lifted up to the ceiling height, so select it by its world AABB.
    const ceiling = meshes.find((mesh) => {
      const box = new THREE.Box3().setFromObject(mesh)
      return Math.abs(box.min.y - CEILING_HEIGHT) < 1
    })
    expect(ceiling).toBeDefined()
    const ceilingMesh = ceiling as THREE.Mesh

    const ceilingBox = new THREE.Box3().setFromObject(ceilingMesh)
    // A flat horizontal plane: no thickness, both faces at the ceiling height.
    expect(ceilingBox.min.y).toBeCloseTo(CEILING_HEIGHT, PRECISION)
    expect(ceilingBox.max.y).toBeCloseTo(CEILING_HEIGHT, PRECISION)
    // It spans the room's clear polygon in x and z.
    expect(ceilingBox.min.x).toBeCloseTo(ORIGIN, PRECISION)
    expect(ceilingBox.max.x).toBeCloseTo(ROOM_WIDTH, PRECISION)
    expect(ceilingBox.min.z).toBeCloseTo(ORIGIN, PRECISION)
    expect(ceilingBox.max.z).toBeCloseTo(ROOM_DEPTH, PRECISION)

    const geometry = ceilingMesh.geometry as THREE.BufferGeometry
    const normals = readNormals(geometry)
    // The single-sided ceiling faces world -Y, down into the room.
    const ceilingNormal = normals[0]
    expect(ceilingNormal).toBeDefined()
    expect(ceilingNormal?.x).toBeCloseTo(0, PRECISION_5)
    expect(ceilingNormal?.y).toBeCloseTo(-1, PRECISION_5)
    expect(ceilingNormal?.z).toBeCloseTo(0, PRECISION_5)

    // Its one drawn surface role is `base`, like the slab's downward face.
    const ceilingMaterials = Array.isArray(ceilingMesh.material)
      ? ceilingMesh.material
      : [ceilingMesh.material]
    const groups = materialGroups(geometry)
    const drawnRoles =
      groups.length > 0
        ? new Set(groups.map((g) => ceilingMaterials[g.materialIndex]?.name))
        : new Set(ceilingMaterials.map((material) => material.name))
    expect([...drawnRoles]).toEqual(['base'])
  })

  it('cuts an interior void out of the floor slab top cap while covering the surrounding ring', () => {
    const node = rectangularRoom({ holes: [HOLE] })

    const group = buildRoomShell(node, new NeutralMaterialProvider())

    const slab = findFloorSlab(group)
    expect(slab).toBeDefined()

    const triangles = topCapTriangles(slab as THREE.Mesh)

    // The void is cut: no cap triangle covers the hole's centroid.
    expect(triangles.some((t) => pointInTriangle2D(HOLE_CENTROID, t))).toBe(false)
    // The solid ring around the void stays covered.
    expect(triangles.some((t) => pointInTriangle2D(RING_SAMPLE, t))).toBe(true)
  })
})
