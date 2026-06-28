import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { OpeningSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'

import { buildOpeningFill } from './opening-fill-builder'
import { swingOpeningGroup } from './opening-swing'

const PRECISION = 3

// A single-swing door hinged at its start jamb. Plan x maps to world X and plan y
// to world Z, so the hinge jamb sits at world (550, *, 0) and the far jamb at
// world (1450, *, 0).
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

const HINGE_POINT = new THREE.Vector3(550, 1000, 0)
const FAR_JAMB = new THREE.Vector3(1450, 1000, 0)
const SWING_RADIUS = 900

describe('swingOpeningGroup', () => {
  it('leaves the group untransformed when fully shut', () => {
    const group = buildOpeningFill(singleSwingDoor(), new NeutralMaterialProvider())

    swingOpeningGroup(group, singleSwingDoor(), 0)
    group.updateMatrix()

    expect(group.position.length()).toBeCloseTo(0, PRECISION)
    // The identity quaternion has w = 1.
    expect(group.quaternion.w).toBeCloseTo(1, PRECISION)
  })

  it('swings the leaf about the hinge jamb when fully open', () => {
    const group = buildOpeningFill(singleSwingDoor(), new NeutralMaterialProvider())

    swingOpeningGroup(group, singleSwingDoor(), 1)
    group.updateMatrix()

    // The hinge jamb is the pivot, so it stays put.
    const hinge = HINGE_POINT.clone().applyMatrix4(group.matrix)
    expect(hinge.x).toBeCloseTo(HINGE_POINT.x, PRECISION)
    expect(hinge.y).toBeCloseTo(HINGE_POINT.y, PRECISION)
    expect(hinge.z).toBeCloseTo(HINGE_POINT.z, PRECISION)

    // The far jamb swings a quarter turn: it ends over the hinge in X and a full
    // leaf-width away across the wall, keeping its distance from the hinge.
    const far = FAR_JAMB.clone().applyMatrix4(group.matrix)
    expect(far.x).toBeCloseTo(HINGE_POINT.x, PRECISION)
    expect(Math.abs(far.z)).toBeCloseTo(SWING_RADIUS, PRECISION)
    expect(far.distanceTo(hinge)).toBeCloseTo(SWING_RADIUS, PRECISION)
  })
})
