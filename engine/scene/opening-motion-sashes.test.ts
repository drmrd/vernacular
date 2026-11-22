import type * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { openingMotion, type OpeningPose, type OpeningSceneNode } from '../../core'
import { applyOpeningMotion, applyOpeningPose } from '../index'

import { openingFillSashOf } from './opening-fill-builder'
import {
  HEAD,
  PRECISION,
  SILL,
  TOLERANCE,
  doubleHungWindow,
  expectSameBox,
  fillOf,
  hungWindow,
  meshesOf,
  rootWith,
  singleSwingDoor,
  worldBoxOf,
} from './opening-motion-test-support'

const FULL_RISE = 570
const HALF_RISE = 285
const LOWEST_UPPER_POINT_WHEN_LOWERED = 960

function builtBoxesOf(node: OpeningSceneNode): THREE.Box3[] {
  return meshesOf(fillOf(rootWith(node), node)).map((mesh) => worldBoxOf(mesh).clone())
}

function expectShiftedBy(mesh: THREE.Mesh, built: THREE.Box3, shiftY: number): void {
  const box = worldBoxOf(mesh)
  expect(box.min.y).toBeCloseTo(built.min.y + shiftY, PRECISION)
  expect(box.max.y).toBeCloseTo(built.max.y + shiftY, PRECISION)
}

// Checks each mesh of the posed opening against its built box: a mesh of the named sash is
// shifted by its own travel, and every other mesh stays exactly where it was built.
function expectSashShifts(
  node: OpeningSceneNode,
  pose: OpeningPose,
  shifts: Readonly<Record<'lower' | 'upper', number>>,
): void {
  const root = rootWith(node)
  const built = builtBoxesOf(node)

  applyOpeningPose(root, node, pose)

  const meshes = meshesOf(fillOf(root, node))
  expect(meshes).toHaveLength(built.length)
  meshes.forEach((mesh, index) => {
    const sash = openingFillSashOf(mesh)
    const box = built[index] as THREE.Box3
    if (sash === undefined) expectSameBox(worldBoxOf(mesh), box)
    else expectShiftedBy(mesh, box, shifts[sash])
  })
}

describe('applyOpeningPose on a double-hung window', () => {
  const node = doubleHungWindow()

  it('lowers the upper sash of a double-hung window and leaves the lower sash in its built box', () => {
    expectSashShifts(node, { upper: 1 }, { lower: 0, upper: 0 - FULL_RISE })

    const root = rootWith(node)
    applyOpeningPose(root, node, { upper: 1 })
    const upper = meshesOf(fillOf(root, node)).filter((mesh) => openingFillSashOf(mesh) === 'upper')
    expect(upper.length).toBeGreaterThan(0)
    const lowest = Math.min(...upper.map((mesh) => worldBoxOf(mesh).min.y))
    expect(lowest).toBeCloseTo(LOWEST_UPPER_POINT_WHEN_LOWERED, PRECISION)
    expect(lowest).toBeGreaterThanOrEqual(SILL - TOLERANCE)
  })

  it('moves each sash half its rise when both are open', () => {
    expectSashShifts(node, { lower: 0.5, upper: 0.5 }, { lower: HALF_RISE, upper: 0 - HALF_RISE })
  })

  it('keeps every part between the sill and the head in every pose', () => {
    const poses: OpeningPose[] = [
      { upper: 1 },
      { lower: 0.5, upper: 0.5 },
      { lower: 1 },
      { lower: 0.75, upper: 0.25 },
    ]

    for (const pose of poses) {
      const root = rootWith(node)

      applyOpeningPose(root, node, pose)

      for (const mesh of meshesOf(fillOf(root, node))) {
        const box = worldBoxOf(mesh)
        expect(box.min.y).toBeGreaterThanOrEqual(SILL - TOLERANCE)
        expect(box.max.y).toBeLessThanOrEqual(HEAD + TOLERANCE)
      }
    }
  })

  it('returns every mesh to its exact built box when shut after both sashes were open', () => {
    const root = rootWith(node)
    const built = builtBoxesOf(node)

    applyOpeningPose(root, node, { lower: 0.5, upper: 0.5 })
    applyOpeningPose(root, node, {})

    const meshes = meshesOf(fillOf(root, node))
    meshes.forEach((mesh, index) => {
      expect(mesh.position.length()).toBe(0)
      expectSameBox(worldBoxOf(mesh), built[index] as THREE.Box3)
    })
  })
})

describe('applyOpeningPose on other openings', () => {
  it('never moves the upper sash of a single-hung window', () => {
    expectSashShifts(
      hungWindow('single-hung-window'),
      { lower: 1, upper: 1 },
      { lower: FULL_RISE, upper: 0 },
    )
  })

  it('swings a door by its primary part as applyOpeningMotion does', () => {
    const node = singleSwingDoor()
    const root = rootWith(node)
    const other = rootWith(node)

    applyOpeningPose(root, node, { primary: 1 })
    applyOpeningMotion(fillOf(other, node), openingMotion(node.type, node), 1)

    const swung = fillOf(root, node).quaternion
    const expected = fillOf(other, node).quaternion
    expect(swung.x).toBeCloseTo(expected.x, PRECISION)
    expect(swung.y).toBeCloseTo(expected.y, PRECISION)
    expect(swung.z).toBeCloseTo(expected.z, PRECISION)
    expect(swung.w).toBeCloseTo(expected.w, PRECISION)
    expect(swung.w).toBeLessThan(1)
  })

  it('does nothing for an opening that is not in the scene', () => {
    const root = rootWith(singleSwingDoor())

    expect(() => applyOpeningPose(root, doubleHungWindow(), { lower: 1 })).not.toThrow()
  })
})
