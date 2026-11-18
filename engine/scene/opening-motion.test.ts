import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { HingeMotion, OpeningSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'

import { buildOpeningFill, openingFillSashOf } from './opening-fill-builder'
import { applyOpeningMotion, applyOpeningMotionForNode } from './opening-motion'

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

// A pocket door on the same wall, hinged-field at start; it resolves to a slide.
function pocketDoor(): OpeningSceneNode {
  return { ...singleSwingDoor(), id: 'opening:test-pocket', type: 'pocket-door' }
}

function rootWith(...nodes: OpeningSceneNode[]): THREE.Object3D {
  const root = new THREE.Group()
  for (const node of nodes) {
    root.add(buildOpeningFill(node, new NeutralMaterialProvider()))
  }
  return root
}

describe('applyOpeningMotionForNode', () => {
  it('resolves a node motion and slides a pocket door along the wall', () => {
    const node = pocketDoor()
    const root = rootWith(node)

    applyOpeningMotionForNode(root, node, 1)

    const group = root.getObjectByName(node.id)
    expect(group).toBeDefined()
    expect(group?.position.x).toBeCloseTo(node.width, PRECISION)
    expect(group?.position.y).toBeCloseTo(0, PRECISION)
    expect(group?.position.z).toBeCloseTo(0, PRECISION)
  })

  it('rests a whole-group slide at position zero without rotation when shut again', () => {
    const node = pocketDoor()
    const root = rootWith(node)

    applyOpeningMotionForNode(root, node, 1)
    expect(fillOf(root, node).position.length()).toBeGreaterThan(0)

    applyOpeningMotionForNode(root, node, 0)

    const group = fillOf(root, node)
    expect(group.position.x).toBeCloseTo(0, PRECISION)
    expect(group.position.y).toBeCloseTo(0, PRECISION)
    expect(group.position.z).toBeCloseTo(0, PRECISION)
    expect(group.quaternion.w).toBeCloseTo(1, PRECISION)
  })

  it('swings a door off its built pose and rests it shut at zero', () => {
    const node = singleSwingDoor()
    const root = rootWith(node)

    applyOpeningMotionForNode(root, node, 1)
    expect(root.getObjectByName(node.id)?.position.length()).toBeGreaterThan(0)

    applyOpeningMotionForNode(root, node, 0)
    expect(root.getObjectByName(node.id)?.position.length()).toBeCloseTo(0, PRECISION)
  })

  it('ignores a node whose fill group is absent from the root', () => {
    const root = rootWith(singleSwingDoor())

    expect(() => applyOpeningMotionForNode(root, pocketDoor(), 1)).not.toThrow()
  })
})

const SILL = 900
const HEAD = 2100
const HEIGHT = 1200
const TOLERANCE = 1e-3

function hungWindow(type: 'single-hung-window' | 'double-hung-window'): OpeningSceneNode {
  return { ...doubleHungWindow(), type }
}

function fillOf(root: THREE.Object3D, node: OpeningSceneNode): THREE.Object3D {
  const group = root.getObjectByName(node.id)
  if (group === undefined) throw new Error('the fill group is missing from the root')
  return group
}

function meshesOf(group: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  return meshes
}

function worldBoxOf(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true)
  return new THREE.Box3().setFromObject(object)
}

function expectSameBox(actual: THREE.Box3, expected: THREE.Box3): void {
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(actual.min[axis]).toBeCloseTo(expected.min[axis], PRECISION)
    expect(actual.max[axis]).toBeCloseTo(expected.max[axis], PRECISION)
  }
}

function lowestPointOfLowerSash(group: THREE.Object3D): number {
  const lower = meshesOf(group).filter((mesh) => openingFillSashOf(mesh) === 'lower')
  expect(lower.length).toBeGreaterThan(0)
  return Math.min(...lower.map((mesh) => worldBoxOf(mesh).min.y))
}

describe.each(['double-hung-window', 'single-hung-window'] as const)(
  'applyOpeningMotionForNode on a %s',
  (type) => {
    const node = hungWindow(type)

    it('raises only the lower sash and keeps every part inside its frame when fully open', () => {
      const root = rootWith(node)
      const group = fillOf(root, node)
      const built = worldBoxOf(group).clone()

      applyOpeningMotionForNode(root, node, 1)

      const opened = worldBoxOf(group)
      expect(opened.max.y).toBeLessThanOrEqual(HEAD + TOLERANCE)
      expect(opened.min.y).toBeGreaterThanOrEqual(SILL - TOLERANCE)
      expect(opened.min.x).toBeCloseTo(built.min.x, PRECISION)
      expect(opened.max.x).toBeCloseTo(built.max.x, PRECISION)
      expect(opened.min.z).toBeCloseTo(built.min.z, PRECISION)
      expect(opened.max.z).toBeCloseTo(built.max.z, PRECISION)
      expect(group.position.length()).toBeCloseTo(0, PRECISION)
      expect(group.quaternion.w).toBeCloseTo(1, PRECISION)
    })

    it('opens no more than half of the height', () => {
      const root = rootWith(node)

      applyOpeningMotionForNode(root, node, 1)

      const lowest = lowestPointOfLowerSash(fillOf(root, node))
      expect(lowest).toBeGreaterThan(SILL)
      expect(lowest).toBeLessThanOrEqual(SILL + HEIGHT / 2 + TOLERANCE)
    })

    it('leaves every part other than the lower sash where it was built', () => {
      const root = rootWith(node)
      const builtMeshes = meshesOf(fillOf(rootWith(node), node))
      const builtBoxes = builtMeshes.map((mesh) => worldBoxOf(mesh).clone())

      applyOpeningMotionForNode(root, node, 1)

      const meshes = meshesOf(fillOf(root, node))
      expect(meshes).toHaveLength(builtMeshes.length)
      meshes.forEach((mesh, index) => {
        if (openingFillSashOf(mesh) === 'lower') return
        expectSameBox(worldBoxOf(mesh), builtBoxes[index] as THREE.Box3)
        expect(mesh.position.length()).toBeCloseTo(0, PRECISION)
      })
    })

    it('raises the lower sash half as far at half open', () => {
      const root = rootWith(node)
      const group = fillOf(root, node)
      const shutLowest = lowestPointOfLowerSash(group)

      applyOpeningMotionForNode(root, node, 1)
      const fullRise = lowestPointOfLowerSash(group) - shutLowest
      applyOpeningMotionForNode(root, node, 0.5)
      const halfRise = lowestPointOfLowerSash(group) - shutLowest

      expect(fullRise).toBeGreaterThan(0)
      expect(halfRise).toBeCloseTo(fullRise / 2, PRECISION)
    })

    it('rests every part exactly as built when shut again after opening', () => {
      const root = rootWith(node)
      const group = fillOf(root, node)
      const builtBoxes = meshesOf(fillOf(rootWith(node), node)).map((mesh) =>
        worldBoxOf(mesh).clone(),
      )

      applyOpeningMotionForNode(root, node, 1)
      applyOpeningMotionForNode(root, node, 0)

      expect(group.position.length()).toBeCloseTo(0, PRECISION)
      expect(group.quaternion.w).toBeCloseTo(1, PRECISION)
      meshesOf(group).forEach((mesh, index) => {
        expect(mesh.position.length()).toBeCloseTo(0, PRECISION)
        expectSameBox(worldBoxOf(mesh), builtBoxes[index] as THREE.Box3)
      })
    })
  },
)
