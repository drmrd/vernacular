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
  const points = readPositions(geometry).slice(side.start, side.start + side.count)
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
    const center: Point2D = { x: ROOM_WIDTH / 2, z: ROOM_DEPTH / 2 }
    const dots = sideFaceOutwardness(slab as THREE.Mesh, center)

    expect(dots.length).toBeGreaterThan(0)
    for (const dot of dots) expect(dot).toBeGreaterThan(0)
  })
})
