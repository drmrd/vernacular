import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildRoomShell } from './room-builder'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups, readIndex, readPositions } from '../testing'
import { floorSlabThickness } from '../../core'
import type { RoomSceneNode } from '../../core'

const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const PRECISION = 3
const FLOOR_DATUM_Y = 0
const ORIGIN = 0

describe('buildRoomShell', () => {
  it('returns a room group carrying the room id with a floor slab hanging below the finished floor', () => {
    const rectangle = [
      { x: ORIGIN, y: ORIGIN },
      { x: ROOM_WIDTH, y: ORIGIN },
      { x: ROOM_WIDTH, y: ROOM_DEPTH },
      { x: ORIGIN, y: ROOM_DEPTH },
    ]

    const node: RoomSceneNode = {
      id: 'room:r1',
      kind: 'room',
      floorId: 'g',
      polygon: rectangle,
      clearPolygon: rectangle,
      area: ROOM_WIDTH * ROOM_DEPTH,
    }

    const group = buildRoomShell(node, new NeutralMaterialProvider())

    expect(group).toBeInstanceOf(THREE.Group)
    expect(group.name).toBe('room:r1')
    expect(group.userData.entityId).toBe('room:r1')

    const aabb = new THREE.Box3().setFromObject(group)
    expect(aabb.min.x).toBeCloseTo(ORIGIN, PRECISION)
    expect(aabb.max.x).toBeCloseTo(ROOM_WIDTH, PRECISION)
    expect(aabb.min.z).toBeCloseTo(ORIGIN, PRECISION)
    expect(aabb.max.z).toBeCloseTo(ROOM_DEPTH, PRECISION)
    expect(aabb.max.y).toBeCloseTo(FLOOR_DATUM_Y, PRECISION)
    expect(aabb.min.y).toBeCloseTo(-floorSlabThickness(), PRECISION)
  })

  it('groups the floor slab faces into top, base, and exteriorFace surfaces covering every triangle', () => {
    const rectangle = [
      { x: ORIGIN, y: ORIGIN },
      { x: ROOM_WIDTH, y: ORIGIN },
      { x: ROOM_WIDTH, y: ROOM_DEPTH },
      { x: ORIGIN, y: ROOM_DEPTH },
    ]

    const node: RoomSceneNode = {
      id: 'room:r1',
      kind: 'room',
      floorId: 'g',
      polygon: rectangle,
      clearPolygon: rectangle,
      area: ROOM_WIDTH * ROOM_DEPTH,
    }

    const group = buildRoomShell(node, new NeutralMaterialProvider())

    const meshes: THREE.Mesh[] = []
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object)
    })

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
})
