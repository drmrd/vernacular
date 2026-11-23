import * as THREE from 'three'
import { expect } from 'vitest'

import type { HungSash, OpeningSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'

import { buildOpeningFill, openingFillSashOf } from './opening-fill-builder'

export const PRECISION = 3
export const SILL = 900
export const HEAD = 2100
export const HEIGHT = 1200
export const TOLERANCE = 1e-3

// A single-swing door hinged at its start jamb. Plan x maps to world X and plan y
// to world Z, so the hinge jamb sits at world (550, *, 0) and the far jamb at
// world (1450, *, 0).
export function singleSwingDoor(): OpeningSceneNode {
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
export function doubleHungWindow(): OpeningSceneNode {
  return {
    ...singleSwingDoor(),
    id: 'opening:test-window',
    type: 'double-hung-window',
    height: HEIGHT,
    sillHeight: SILL,
  }
}

export function hungWindow(type: 'single-hung-window' | 'double-hung-window'): OpeningSceneNode {
  return { ...doubleHungWindow(), type }
}

export function rootWith(...nodes: OpeningSceneNode[]): THREE.Object3D {
  const root = new THREE.Group()
  for (const node of nodes) {
    root.add(buildOpeningFill(node, new NeutralMaterialProvider()))
  }
  return root
}

export function fillOf(root: THREE.Object3D, node: OpeningSceneNode): THREE.Object3D {
  const group = root.getObjectByName(node.id)
  if (group === undefined) throw new Error('the fill group is missing from the root')
  return group
}

export function meshesOf(group: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  return meshes
}

export function worldBoxOf(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true)
  return new THREE.Box3().setFromObject(object)
}

export function expectSameBox(actual: THREE.Box3, expected: THREE.Box3): void {
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(actual.min[axis]).toBeCloseTo(expected.min[axis], PRECISION)
    expect(actual.max[axis]).toBeCloseTo(expected.max[axis], PRECISION)
  }
}

export function lowestPointOfSash(group: THREE.Object3D, sash: HungSash): number {
  const meshes = meshesOf(group).filter((mesh) => openingFillSashOf(mesh) === sash)
  expect(meshes.length).toBeGreaterThan(0)
  return Math.min(...meshes.map((mesh) => worldBoxOf(mesh).min.y))
}
