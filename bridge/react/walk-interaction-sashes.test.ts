import { describe, expect, it } from 'vitest'

import { applyOpeningPose, type SceneRoot } from '../../engine'
import { emptyOpeningInteraction, type OpeningPose, type OpeningSceneNode } from '../../core'
import { Mesh } from '../../engine/testing'

import { restoreOpenings, settleUnshownOpenings, tickOpenings } from './walk-interaction'
import {
  FULL_STEP,
  holdingOpen,
  hungWindowNode,
  sceneWithOpening,
} from './walk-interaction-test-support'

const FULL_RISE = 570
const HALF_RISE = 285
const PRECISION = 3

// The meshes of the opening's own fill group; the scene root also holds a ground plane.
function meshesOf(root: SceneRoot, node: OpeningSceneNode): Mesh[] {
  const group = root.getObjectByName(node.id)
  if (group === undefined) throw new Error(`no fill group was built for ${node.id}`)
  const meshes: Mesh[] = []
  group.traverse((child) => {
    if (child instanceof Mesh) meshes.push(child)
  })
  return meshes
}

// The indexes of the meshes that a pose moves, read from a scene of its own, so the test
// tells the sashes apart through the engine's public motion and not through its internals.
function meshesMovedBy(node: OpeningSceneNode, pose: OpeningPose): number[] {
  const root = sceneWithOpening(node)
  applyOpeningPose(root, node, pose)
  return meshesOf(root, node).flatMap((mesh, index) => (mesh.position.length() > 0 ? [index] : []))
}

// Checks that each mesh of the lower sash sits `lower` above its built place, each mesh of the
// upper sash `upper` above it, and every other mesh exactly where it was built.
function expectSashShifts(
  root: SceneRoot,
  node: OpeningSceneNode,
  shifts: { lower: number; upper: number },
): void {
  const lowerMeshes = meshesMovedBy(node, { lower: 1 })
  const upperMeshes = meshesMovedBy(node, { upper: 1 })
  expect(lowerMeshes.length).toBeGreaterThan(0)
  if (shifts.upper !== 0) expect(upperMeshes.length).toBeGreaterThan(0)
  meshesOf(root, node).forEach((mesh, index) => {
    if (lowerMeshes.includes(index)) {
      expect(mesh.position.y).toBeCloseTo(shifts.lower, PRECISION)
    } else if (upperMeshes.includes(index)) {
      expect(mesh.position.y).toBeCloseTo(shifts.upper, PRECISION)
    } else {
      expect(mesh.position.length()).toBe(0)
    }
  })
}

describe('walk interaction on a hung window', () => {
  it('lowers only the upper sash when the upper sash is open', () => {
    const node = hungWindowNode('double-hung-window')
    const root = sceneWithOpening(node)
    const openness = new Map<string, OpeningPose>()

    tickOpenings(
      { root, openings: [node], interaction: holdingOpen(node.id, ['upper']), openness },
      FULL_STEP,
    )

    expect(openness.get(node.id)).toEqual({ lower: 0, upper: 1 })
    expectSashShifts(root, node, { lower: 0, upper: 0 - FULL_RISE })
  })

  it('eases both sashes to half travel when both are open', () => {
    const node = hungWindowNode('double-hung-window')
    const root = sceneWithOpening(node)
    const openness = new Map<string, OpeningPose>()

    tickOpenings(
      {
        root,
        openings: [node],
        interaction: holdingOpen(node.id, ['lower', 'upper']),
        openness,
      },
      FULL_STEP,
    )

    expect(openness.get(node.id)).toEqual({ lower: 0.5, upper: 0.5 })
    expectSashShifts(root, node, { lower: HALF_RISE, upper: 0 - HALF_RISE })
  })

  it('never moves the upper sash of a single-hung window', () => {
    const node = hungWindowNode('single-hung-window')
    const root = sceneWithOpening(node)
    const openness = new Map<string, OpeningPose>()

    tickOpenings(
      { root, openings: [node], interaction: holdingOpen(node.id, ['lower']), openness },
      FULL_STEP,
    )

    expect(openness.get(node.id)).toEqual({ lower: 1 })
    expectSashShifts(root, node, { lower: FULL_RISE, upper: 0 })
  })

  it('returns every mesh to its built pose when both sashes shut', () => {
    const node = hungWindowNode('double-hung-window')
    const root = sceneWithOpening(node)
    const openness = new Map<string, OpeningPose>()
    const bothOpen = holdingOpen(node.id, ['lower', 'upper'])
    const allShut = emptyOpeningInteraction()

    tickOpenings({ root, openings: [node], interaction: allShut, openness }, FULL_STEP)
    expect(openness.has(node.id)).toBe(false)

    tickOpenings({ root, openings: [node], interaction: bothOpen, openness }, FULL_STEP)
    tickOpenings({ root, openings: [node], interaction: allShut, openness }, FULL_STEP)

    expect(openness.get(node.id)).toEqual({ lower: 0, upper: 0 })
    for (const mesh of meshesOf(root, node)) {
      expect(mesh.position.length()).toBe(0)
    }
  })

  it('settles an unshown window to half travel on each sash when both are open', () => {
    const unshownId = 'opening:unshown-window'
    const openness = new Map<string, OpeningPose>([[unshownId, { lower: 0.2 }]])

    settleUnshownOpenings({
      openings: [],
      interaction: holdingOpen(unshownId, ['lower', 'upper']),
      openness,
    })

    expect(openness.get(unshownId)).toEqual({ lower: 0.5, upper: 0.5 })
  })

  it('restores a window open at its upper sash to the lowered pose', () => {
    const node = hungWindowNode('double-hung-window')
    const root = sceneWithOpening(node)
    const openness = new Map<string, OpeningPose>()

    restoreOpenings({
      root,
      openings: [node],
      interaction: holdingOpen(node.id, ['upper']),
      openness,
    })

    expect(openness.get(node.id)).toEqual({ lower: 0, upper: 1 })
    expectSashShifts(root, node, { lower: 0, upper: 0 - FULL_RISE })
  })
})
