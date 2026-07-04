import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

import { buildRoomShell } from './room-builder'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups, readNormals, readPositions } from '../testing'
import type { RoomSceneNode, Vector3 } from '../../core'

const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const ORIGIN = 0
const VERTICES_PER_TRIANGLE = 3

const RECTANGLE = [
  { x: ORIGIN, y: ORIGIN },
  { x: ROOM_WIDTH, y: ORIGIN },
  { x: ROOM_WIDTH, y: ROOM_DEPTH },
  { x: ORIGIN, y: ROOM_DEPTH },
]

interface Point2D {
  x: number
  z: number
}

function rectangularRoom(): RoomSceneNode {
  return {
    id: 'room:r1',
    kind: 'room',
    floorId: 'g',
    polygon: RECTANGLE,
    clearPolygon: RECTANGLE,
    area: ROOM_WIDTH * ROOM_DEPTH,
  }
}

// The floor slab is the only surface in the room group carrying an upward `top` cap.
function findFloorSlab(group: THREE.Object3D): THREE.Mesh | undefined {
  const meshes: THREE.Mesh[] = []
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })
  return meshes.find(
    (mesh) =>
      Array.isArray(mesh.material) && mesh.material.some((material) => material.name === 'top'),
  )
}

const VERTICES_PER_SIDE_FACE = 6
// A vertical side face runs along world z at a fixed world x, so its vertices
// share one x. A horizontal-in-plan edge (a top or bottom boundary run) instead
// spans the room width in x, so its spread is thousands of millimeters. One
// millimeter cleanly separates the two without depending on the inset size.
const CONSTANT_X_FACE_SPREAD_MM = 1

// A second adjacent room whose slab reaches the same shared wall centerline from
// the far side. Its left edge sits on `sharedX`, where room A's right edge also
// lands, so before any inset the two rooms' side faces there are coincident.
function adjacentRoom(sharedX: number, width: number, depth: number): RoomSceneNode {
  return {
    id: 'room:r2',
    kind: 'room',
    floorId: 'g',
    polygon: [
      { x: sharedX, y: ORIGIN },
      { x: sharedX + width, y: ORIGIN },
      { x: sharedX + width, y: depth },
      { x: sharedX, y: depth },
    ],
    clearPolygon: [
      { x: sharedX, y: ORIGIN },
      { x: sharedX + width, y: ORIGIN },
      { x: sharedX + width, y: depth },
      { x: sharedX, y: depth },
    ],
    area: width * depth,
  }
}

// The world positions of the slab's `exteriorFace` side faces, in draw order.
function sideFacePositions(mesh: THREE.Mesh): Vector3[] {
  const geometry = mesh.geometry as THREE.BufferGeometry
  const materials = mesh.material as THREE.Material[]
  const side = materialGroups(geometry).find(
    (group) => materials[group.materialIndex]?.name === 'exteriorFace',
  )
  if (side === undefined) return []
  return readPositions(geometry).slice(side.start, side.start + side.count)
}

// The constant world-x of each vertical slab side face: the faces whose six
// vertices share one x. The horizontal-in-plan runs are excluded by their wide
// x spread.
function verticalSideFaceXs(mesh: THREE.Mesh): number[] {
  const points = sideFacePositions(mesh)
  const xs: number[] = []
  for (
    let base = 0;
    base + VERTICES_PER_SIDE_FACE <= points.length;
    base += VERTICES_PER_SIDE_FACE
  ) {
    const face = points.slice(base, base + VERTICES_PER_SIDE_FACE) as Vector3[]
    const faceXs = face.map((vertex) => vertex.x)
    const spread = Math.max(...faceXs) - Math.min(...faceXs)
    if (spread < CONSTANT_X_FACE_SPREAD_MM) xs.push(faceXs[0] as number)
  }
  return xs
}

// Per side triangle of the slab, the dot of its outward direction (face centroid
// minus the interior reference) with its XZ face normal. The slab is flat-shaded
// and non-indexed, so each triangle's first-vertex normal is its face normal.
function sideFaceOutwardness(mesh: THREE.Mesh, interior: Point2D): number[] {
  const geometry = mesh.geometry as THREE.BufferGeometry
  const materials = mesh.material as THREE.Material[]
  const side = materialGroups(geometry).find(
    (group) => materials[group.materialIndex]?.name === 'exteriorFace',
  )
  if (side === undefined) return []
  const points = sideFacePositions(mesh)
  const normals = readNormals(geometry).slice(side.start, side.start + side.count)
  return Array.from({ length: Math.floor(points.length / VERTICES_PER_TRIANGLE) }, (_, t) => {
    const base = t * VERTICES_PER_TRIANGLE
    const [a, b, c] = points.slice(base, base + VERTICES_PER_TRIANGLE) as [
      Vector3,
      Vector3,
      Vector3,
    ]
    const normal = normals[base] as Vector3
    const cx = (a.x + b.x + c.x) / 3
    const cz = (a.z + b.z + c.z) / 3
    return normal.x * (cx - interior.x) + normal.z * (cz - interior.z)
  })
}

describe('buildRoomShell floor slab side faces', () => {
  it('winds every side face so its normal points outward away from the slab interior', () => {
    const group = buildRoomShell(rectangularRoom(), new NeutralMaterialProvider())

    const slab = findFloorSlab(group)
    expect(slab).toBeDefined()

    // The rectangle's XZ center stands for the slab interior. A side face whose
    // normal points outward has a positive dot with the vector from the interior
    // out to the face, so every side triangle must read strictly greater than 0.
    // Plan y maps to world -z, so the interior center sits at a negated z.
    const center: Point2D = { x: ROOM_WIDTH / 2, z: -ROOM_DEPTH / 2 }
    const dots = sideFaceOutwardness(slab as THREE.Mesh, center)

    expect(dots.length).toBeGreaterThan(0)
    for (const dot of dots) expect(dot).toBeGreaterThan(0)
  })

  it('keeps two adjacent rooms slab side faces off the shared wall centerline plane', () => {
    // Room A reaches the shared centerline at x = ROOM_WIDTH from its side, and
    // room B reaches the same centerline from the far side. After ADR-0129 moved
    // the shared slab edge to the centerline, their side faces there are back to
    // back with opposite normals. Left unbiased they are coplanar and z-fight the
    // moment any cutaway, below-floor, transparent, or selected material draws
    // both, so the builder must keep the two faces off one shared plane.
    const materials = new NeutralMaterialProvider()
    const roomA = buildRoomShell(rectangularRoom(), materials)
    const roomB = buildRoomShell(adjacentRoom(ROOM_WIDTH, ROOM_WIDTH, ROOM_DEPTH), materials)

    const slabA = findFloorSlab(roomA)
    const slabB = findFloorSlab(roomB)
    expect(slabA).toBeDefined()
    expect(slabB).toBeDefined()

    // Room A spans x in [0, ROOM_WIDTH], so its shared side face is the farthest
    // in x; room B spans [ROOM_WIDTH, 2 * ROOM_WIDTH], so its shared side face is
    // the nearest in x. The two must land on different planes.
    const sharedFaceA = Math.max(...verticalSideFaceXs(slabA as THREE.Mesh))
    const sharedFaceB = Math.min(...verticalSideFaceXs(slabB as THREE.Mesh))

    expect(sharedFaceB).toBeGreaterThan(sharedFaceA)
  })
})
