import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { colorFromHex, solidTreatment, surfaceKey } from '../../core'
import type { Vector3, WallFootprint } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { PaintMaterialProvider } from '../materials/paint-material-provider'
import { materialGroups, readIndex, readNormals, readPositions } from '../testing'

import {
  FULL_THICKNESS_SPAN,
  HALF_THICKNESS,
  HEIGHT,
  PRECISION,
  WALL_LENGTH,
  drawnRolesOf,
  expectBoxSpan,
  horizontalWall,
  maxAxisOfRole,
} from './wall-test-support'
import { buildWallMesh, buildWallPrism } from './wall-prism'

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
      // The prism geometry is non-indexed, so the group start indexes the normal
      // attribute directly; an indexed geometry would resolve through the index.
      const vertexIndex = index.length > 0 ? index[group.start] : group.start
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

  it('paints the wall long faces from the paint store by side', () => {
    const hex = '#7744aa'
    const ref = { kind: 'wall-face', wallId: 'w1', side: 'left' } as const
    const paint = { [surfaceKey(ref)]: solidTreatment(colorFromHex(hex), 'matte') }

    const mesh = buildWallMesh(
      horizontalWall(),
      new PaintMaterialProvider({ lightColor: { r: 1, g: 1, b: 1 }, paint }),
    )
    const materials = mesh.material as THREE.MeshStandardMaterial[]
    const interiorLongFace = materials[4]
    const exteriorLongFace = materials[5]
    expect(interiorLongFace).toBeDefined()
    expect(exteriorLongFace).toBeDefined()
    if (interiorLongFace === undefined || exteriorLongFace === undefined) return

    // Index 4 is the interior long face (side 'left'); index 5 is the exterior face.
    expect(interiorLongFace.color.equals(new THREE.Color(hex))).toBe(true)
    expect(exteriorLongFace.color.equals(new THREE.Color(hex))).toBe(false)
  })
})

describe('buildWallPrism', () => {
  it('slants a mitered end so each long face reaches its own footprint corner', () => {
    // The b-end is mitered: its +normal (interior) corner is pulled inward to
    // x = WALL_LENGTH - 600 while its -normal (exterior) corner stays at the full
    // length. The interior long face should reach only its corner; the exterior
    // long face should still reach the full length.
    const footprint: WallFootprint = {
      aPlus: { x: 0, y: HALF_THICKNESS },
      aMinus: { x: 0, y: -HALF_THICKNESS },
      bPlus: { x: WALL_LENGTH - 600, y: HALF_THICKNESS },
      bMinus: { x: WALL_LENGTH, y: -HALF_THICKNESS },
    }

    const mesh = buildWallPrism(horizontalWall(), footprint, new NeutralMaterialProvider())

    expect(mesh.userData.entityId).toBe('wall:w1')
    expect(maxAxisOfRole(mesh, 'interiorFace', 'x')).toBeCloseTo(WALL_LENGTH - 600, PRECISION)
    expect(maxAxisOfRole(mesh, 'exteriorFace', 'x')).toBeCloseTo(WALL_LENGTH, PRECISION)
  })
})
