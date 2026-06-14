import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { OpeningSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'

import { buildOpeningFill } from './opening-fill-builder'

const PRECISION = 3

const LEAF_MIN_X = 560
const LEAF_MAX_X = 1440
const LEAF_MIN_Y = 10
const LEAF_MAX_Y = 2022
const LEAF_MIN_Z = -22
const LEAF_MAX_Z = 22

function singleSwingDoor(): OpeningSceneNode {
  return {
    id: 'opening:test-door',
    kind: 'opening',
    floorId: 'floor-1',
    type: 'single-swing-door',
    center: { x: 1000, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 900,
    height: 2032,
    sillHeight: 0,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'south',
  }
}

function meshesOf(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter((child): child is THREE.Mesh => (child as THREE.Mesh).isMesh)
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
})
