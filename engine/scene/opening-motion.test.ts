import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { HingeMotion, OpeningSceneNode, SlideMotion } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'

import { buildOpeningFill } from './opening-fill-builder'
import { applyOpeningMotion } from './opening-motion'

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

// A double-hung window on the same wall, for the slide motions.
function doubleHungWindow(): OpeningSceneNode {
  return {
    ...singleSwingDoor(),
    id: 'opening:test-window',
    type: 'double-hung-window',
    height: 1200,
    sillHeight: 900,
  }
}

const SASH_RISE = 1200

const HINGE_POINT = new THREE.Vector3(550, 1000, 0)
const FAR_JAMB = new THREE.Vector3(1450, 1000, 0)
const SWING_RADIUS = 900

function jambHingeMotion(): HingeMotion {
  return {
    kind: 'hinge',
    edge: 'jamb',
    pivot: { x: 550, y: 0, z: 0 },
    axis: { x: 0, y: 1, z: 0 },
    openAngle: Math.PI / 2,
    partId: 'primary',
    partCount: 1,
  }
}

describe('applyOpeningMotion hinge', () => {
  it('leaves the group untransformed when fully shut', () => {
    const group = buildOpeningFill(singleSwingDoor(), new NeutralMaterialProvider())

    applyOpeningMotion(group, jambHingeMotion(), 0)
    group.updateMatrix()

    expect(group.position.length()).toBeCloseTo(0, PRECISION)
    expect(group.quaternion.w).toBeCloseTo(1, PRECISION)
  })

  it('rotates the leaf about the resolved hinge edge when fully open', () => {
    const group = buildOpeningFill(singleSwingDoor(), new NeutralMaterialProvider())

    applyOpeningMotion(group, jambHingeMotion(), 1)
    group.updateMatrix()

    // The hinge edge is the pivot, so it stays put.
    const hinge = HINGE_POINT.clone().applyMatrix4(group.matrix)
    expect(hinge.x).toBeCloseTo(HINGE_POINT.x, PRECISION)
    expect(hinge.z).toBeCloseTo(HINGE_POINT.z, PRECISION)

    // The far jamb swings a quarter turn: over the hinge in X, a full leaf-width
    // across the wall, keeping its distance from the hinge.
    const far = FAR_JAMB.clone().applyMatrix4(group.matrix)
    expect(far.x).toBeCloseTo(HINGE_POINT.x, PRECISION)
    expect(Math.abs(far.z)).toBeCloseTo(SWING_RADIUS, PRECISION)
    expect(far.distanceTo(hinge)).toBeCloseTo(SWING_RADIUS, PRECISION)
  })
})

describe('applyOpeningMotion vertical slide', () => {
  const motion: SlideMotion = {
    kind: 'slide',
    axis: 'vertical',
    travel: { x: 0, y: SASH_RISE, z: 0 },
    partId: 'primary',
    partCount: 2,
  }

  it('raises the sash straight up when fully open and rests it shut at zero', () => {
    const group = buildOpeningFill(doubleHungWindow(), new NeutralMaterialProvider())

    applyOpeningMotion(group, motion, 1)
    expect(group.position.x).toBeCloseTo(0, PRECISION)
    expect(group.position.y).toBeCloseTo(SASH_RISE, PRECISION)
    expect(group.position.z).toBeCloseTo(0, PRECISION)
    expect(group.quaternion.w).toBeCloseTo(1, PRECISION)

    applyOpeningMotion(group, motion, 0)
    expect(group.position.length()).toBeCloseTo(0, PRECISION)
  })
})
