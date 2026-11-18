import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { OpeningSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'

import {
  buildOpeningFill,
  OPENING_FILL_ROLE_KEY,
  OPENING_FILL_SASH_KEY,
} from './opening-fill-builder'

const PRECISION = 3

const LEAF_MIN_X = 560
const LEAF_MAX_X = 1440
const LEAF_MIN_Y = 10
const LEAF_MAX_Y = 2022
const LEAF_MIN_Z = -22
const LEAF_MAX_Z = 22

// A hung window's sashes sit on two tracks 25 mm either side of the wall centerline, each
// 50 mm deep: the lower sash spans [-50, 0] and the upper one [0, 50] (mirrored when facing
// the other way). The glass is 6 mm thick and centered on its track.
const LOWER_SASH_COUNT = 6
const UPPER_SASH_COUNT = 5
const SASH_DEPTH_NEAR = -50
const SASH_DEPTH_CENTER = 0
const SASH_DEPTH_FAR = 50
const LOWER_GLASS_MIN_Z = -28
const LOWER_GLASS_MAX_Z = -22
const UPPER_GLASS_MIN_Z = 22
const UPPER_GLASS_MAX_Z = 28

type OpeningNodeOverrides = Partial<OpeningSceneNode> & Pick<OpeningSceneNode, 'id' | 'type'>

function openingNode(overrides: OpeningNodeOverrides): OpeningSceneNode {
  return {
    kind: 'opening',
    floorId: 'floor-1',
    center: { x: 1000, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 900,
    height: 1200,
    sillHeight: 900,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'south',
    ...overrides,
  }
}

function singleSwingDoor(): OpeningSceneNode {
  return openingNode({
    id: 'opening:test-door',
    type: 'single-swing-door',
    height: 2032,
    sillHeight: 0,
  })
}

function fixedWindow(): OpeningSceneNode {
  return openingNode({ id: 'opening:test-window', type: 'picture-window' })
}

function doubleHungWindow(): OpeningSceneNode {
  return openingNode({ id: 'opening:test-double-hung-window', type: 'double-hung-window' })
}

function meshesOf(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter((child): child is THREE.Mesh => (child as THREE.Mesh).isMesh)
}

function sashMeshesOf(group: THREE.Group, sash: 'lower' | 'upper'): THREE.Mesh[] {
  return meshesOf(group).filter((mesh) => mesh.userData[OPENING_FILL_SASH_KEY] === sash)
}

function roleMeshesOf(meshes: THREE.Mesh[], role: 'leaf' | 'glass'): THREE.Mesh[] {
  return meshes.filter((mesh) => mesh.userData[OPENING_FILL_ROLE_KEY] === role)
}

function zExtentOf(mesh: THREE.Mesh): [number, number] {
  mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox as THREE.Box3
  return [box.min.z, box.max.z]
}

function expectZExtents(meshes: THREE.Mesh[], min: number, max: number): void {
  expect(meshes.length).toBeGreaterThan(0)
  for (const mesh of meshes) {
    const [lo, hi] = zExtentOf(mesh)
    expect(lo).toBeCloseTo(min, PRECISION)
    expect(hi).toBeCloseTo(max, PRECISION)
  }
}

function materialNameOf(mesh: THREE.Mesh): string {
  return (mesh.material as THREE.Material).name
}

describe('buildOpeningFill', () => {
  it('returns a group carrying the opening id with one leaf box for a single door', () => {
    const group = buildOpeningFill(singleSwingDoor(), new NeutralMaterialProvider())

    expect(group.userData.entityId).toBe('opening:test-door')

    const meshes = meshesOf(group)
    expect(meshes).toHaveLength(1)

    const leaf = meshes.at(0)
    expect(leaf).toBeDefined()
    if (leaf === undefined) return

    leaf.geometry.computeBoundingBox()
    const box = leaf.geometry.boundingBox as THREE.Box3
    expect(box.min.x).toBeCloseTo(LEAF_MIN_X, PRECISION)
    expect(box.max.x).toBeCloseTo(LEAF_MAX_X, PRECISION)
    expect(box.min.y).toBeCloseTo(LEAF_MIN_Y, PRECISION)
    expect(box.max.y).toBeCloseTo(LEAF_MAX_Y, PRECISION)
    expect(box.min.z).toBeCloseTo(LEAF_MIN_Z, PRECISION)
    expect(box.max.z).toBeCloseTo(LEAF_MAX_Z, PRECISION)
  })

  it('builds four leaf sash bars and one transparent glass pane for a window', () => {
    const group = buildOpeningFill(fixedWindow(), new NeutralMaterialProvider())

    const meshes = meshesOf(group)
    const materialNames = meshes.map(materialNameOf)

    expect(materialNames.filter((name) => name === 'leaf')).toHaveLength(4)
    expect(materialNames.filter((name) => name === 'glass')).toHaveLength(1)

    const glass = meshes.find((mesh) => materialNameOf(mesh) === 'glass')
    expect(glass).toBeDefined()
    if (glass === undefined) return
    expect((glass.material as THREE.Material).transparent).toBe(true)
  })

  it('stamps every built part mesh with its opening-fill role', () => {
    const group = buildOpeningFill(doubleHungWindow(), new NeutralMaterialProvider())

    const meshes = meshesOf(group)
    const roles = meshes.map((mesh) => mesh.userData[OPENING_FILL_ROLE_KEY])

    expect(roles).toContain('glass')
    expect(roles).toContain('leaf')
    expect(roles.every((role) => role === 'glass' || role === 'leaf')).toBe(true)
  })

  it('stamps each double-hung window mesh with the sash it belongs to', () => {
    const group = buildOpeningFill(doubleHungWindow(), new NeutralMaterialProvider())

    const sashes = meshesOf(group).map((mesh) => mesh.userData[OPENING_FILL_SASH_KEY])

    expect(sashes.every((sash) => sash === 'lower' || sash === 'upper')).toBe(true)
    expect(sashes.filter((sash) => sash === 'lower')).toHaveLength(LOWER_SASH_COUNT)
    expect(sashes.filter((sash) => sash === 'upper')).toHaveLength(UPPER_SASH_COUNT)
  })

  it('sets the lower sash on the facing side of the wall and the upper sash on the other', () => {
    const group = buildOpeningFill(doubleHungWindow(), new NeutralMaterialProvider())

    const lower = sashMeshesOf(group, 'lower')
    const upper = sashMeshesOf(group, 'upper')

    expectZExtents(roleMeshesOf(lower, 'leaf'), SASH_DEPTH_NEAR, SASH_DEPTH_CENTER)
    expectZExtents(roleMeshesOf(upper, 'leaf'), SASH_DEPTH_CENTER, SASH_DEPTH_FAR)
    expectZExtents(roleMeshesOf(lower, 'glass'), LOWER_GLASS_MIN_Z, LOWER_GLASS_MAX_Z)
    expectZExtents(roleMeshesOf(upper, 'glass'), UPPER_GLASS_MIN_Z, UPPER_GLASS_MAX_Z)
  })

  it('swaps the two sash tracks when the window faces the other way', () => {
    const window = doubleHungWindow()
    const flipped: OpeningSceneNode = {
      ...window,
      orientation: { hinge: 'start', facing: 'negative' },
    }

    const group = buildOpeningFill(flipped, new NeutralMaterialProvider())

    expectZExtents(
      roleMeshesOf(sashMeshesOf(group, 'lower'), 'leaf'),
      SASH_DEPTH_CENTER,
      SASH_DEPTH_FAR,
    )
    expectZExtents(
      roleMeshesOf(sashMeshesOf(group, 'upper'), 'leaf'),
      SASH_DEPTH_NEAR,
      SASH_DEPTH_CENTER,
    )
  })

  it('leaves a door and a picture window without a sash stamp and on the centerline', () => {
    const door = buildOpeningFill(singleSwingDoor(), new NeutralMaterialProvider())
    const picture = buildOpeningFill(fixedWindow(), new NeutralMaterialProvider())

    for (const mesh of [...meshesOf(door), ...meshesOf(picture)]) {
      expect(OPENING_FILL_SASH_KEY in mesh.userData).toBe(false)
    }
    expectZExtents(meshesOf(door), LEAF_MIN_Z, LEAF_MAX_Z)
  })
})
