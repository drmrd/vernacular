import { describe, expect, it } from 'vitest'

import { applyOpeningPose, type SceneRoot } from '../../engine'
import {
  emptyOpeningInteraction,
  type OpeningPose,
  type OpeningSceneNode,
  type WalkState,
} from '../../core'
import { Mesh } from '../../engine/testing'

import {
  interactFromWalk,
  restoreOpenings,
  settleUnshownOpenings,
  tickOpenings,
} from './walk-interaction'
import {
  FULL_STEP,
  holdingOpen,
  hungWindowNode,
  sceneWithOpening,
} from './walk-interaction-test-support'

// One frame at sixty frames a second: far short of the full travel.
const ONE_FRAME = 1 / 60
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

// The indexes of the meshes that each sash moves, read from a scene of its own, so the test
// tells the sashes apart through the engine's public motion and not through its internals.
function sashMeshes(node: OpeningSceneNode): { lower: number[]; upper: number[] } {
  const movedBy = (pose: OpeningPose): number[] => {
    const root = sceneWithOpening(node)
    applyOpeningPose(root, node, pose)
    return meshesOf(root, node).flatMap((mesh, index) =>
      mesh.position.length() > 0 ? [index] : [],
    )
  }
  return { lower: movedBy({ lower: 1 }), upper: movedBy({ upper: 1 }) }
}

// Checks that each mesh of the lower sash sits `lower` above its built place, each mesh of the
// upper sash `upper` above it, and every other mesh exactly where it was built.
function expectMeshShifts(
  root: SceneRoot,
  node: OpeningSceneNode,
  shifts: { lower: number; upper: number },
): void {
  const sashes = sashMeshes(node)
  meshesOf(root, node).forEach((mesh, index) => {
    if (sashes.lower.includes(index)) {
      expect(mesh.position.y).toBeCloseTo(shifts.lower, PRECISION)
    } else if (sashes.upper.includes(index)) {
      expect(mesh.position.y).toBeCloseTo(shifts.upper, PRECISION)
    } else {
      expect(mesh.position.length()).toBe(0)
    }
  })
}

// A double-hung window has two sashes to tell apart, each of which has meshes to move.
function expectSashShifts(
  root: SceneRoot,
  node: OpeningSceneNode,
  shifts: { lower: number; upper: number },
): void {
  const sashes = sashMeshes(node)
  expect(sashes.lower.length).toBeGreaterThan(0)
  expect(sashes.upper.length).toBeGreaterThan(0)
  expectMeshShifts(root, node, shifts)
}

// A single-hung window has a lower sash only: no mesh answers to the upper sash.
function expectLowerSashOnly(root: SceneRoot, node: OpeningSceneNode, lower: number): void {
  const sashes = sashMeshes(node)
  expect(sashes.lower.length).toBeGreaterThan(0)
  expect(sashes.upper).toEqual([])
  expectMeshShifts(root, node, { lower, upper: 0 })
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
    expectSashShifts(root, node, { lower: 0, upper: -FULL_RISE })
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
    expectSashShifts(root, node, { lower: HALF_RISE, upper: -HALF_RISE })
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
    expectLowerSashOnly(root, node, FULL_RISE)
  })

  it('returns every mesh to its built pose when both sashes shut', () => {
    const node = hungWindowNode('double-hung-window')
    const root = sceneWithOpening(node)
    const openness = new Map<string, OpeningPose>()
    const bothOpen = holdingOpen(node.id, ['lower', 'upper'])
    const allShut = emptyOpeningInteraction()

    tickOpenings({ root, openings: [node], interaction: bothOpen, openness }, FULL_STEP)
    tickOpenings({ root, openings: [node], interaction: allShut, openness }, FULL_STEP)

    expect(openness.get(node.id)).toEqual({ lower: 0, upper: 0 })
    for (const mesh of meshesOf(root, node)) {
      expect(mesh.position.length()).toBe(0)
    }
  })

  it('records no pose for a shut opening that carries none', () => {
    const node = hungWindowNode('double-hung-window')
    const root = sceneWithOpening(node)
    const openness = new Map<string, OpeningPose>()

    tickOpenings(
      { root, openings: [node], interaction: emptyOpeningInteraction(), openness },
      FULL_STEP,
    )

    expect(openness.has(node.id)).toBe(false)
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
    expectSashShifts(root, node, { lower: 0, upper: -FULL_RISE })
  })

  it('keeps a restored window at its lowered upper sash from the first tick, never easing from shut', () => {
    const node = hungWindowNode('double-hung-window')
    const root = sceneWithOpening(node)
    const openness = new Map<string, OpeningPose>()
    const interaction = holdingOpen(node.id, ['upper'])
    restoreOpenings({ root, openings: [node], interaction, openness })

    tickOpenings({ root, openings: [node], interaction, openness }, ONE_FRAME)

    expect(openness.get(node.id)).toEqual({ lower: 0, upper: 1 })
    expectSashShifts(root, node, { lower: 0, upper: -FULL_RISE })
  })

  it('lowers the upper sash when the walker presses E aimed high', () => {
    const node = hungWindowNode('double-hung-window')
    const root = sceneWithOpening(node)
    const openness = new Map<string, OpeningPose>()
    // The eye sits at world y 2050, above the meeting rail of a window whose sill is at 900.
    const aimedHigh: WalkState = { position: { x: 1000, y: 2050, z: -1000 }, yaw: 0, pitch: 0 }

    const interaction = interactFromWalk(aimedHigh, [node], emptyOpeningInteraction())
    tickOpenings({ root, openings: [node], interaction, openness }, FULL_STEP)

    expect(openness.get(node.id)).toEqual({ lower: 0, upper: 1 })
  })
})
