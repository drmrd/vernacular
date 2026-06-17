import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { furnitureFootprintCorners } from '../../core'
import { normalizeModelIntoBox } from './furniture-model'

function nodeFor(width: number, depth: number, height: number, elevationZ = 0) {
  return {
    id: 'furniture:x',
    kind: 'furniture' as const,
    floorId: 'g',
    footprintCorners: furnitureFootprintCorners({ x: 0, y: 0 }, 0, { width, depth }),
    elevationZ,
    height,
    assetRef: { scope: 'user' as const, contentHash: 'h' },
  }
}

describe('normalizeModelIntoBox', () => {
  it('uniformly fits a model inside the footprint and height, centered and on the floor', () => {
    // A 1000 x 1000 x 1000 mm box, nested under a parent with a non-identity transform.
    const inner = new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000))
    const parent = new THREE.Group()
    parent.position.set(50, 50, 50)
    parent.add(inner)
    const node = nodeFor(2000, 2000, 4000, 0) // target taller and wider than the model

    const placed = normalizeModelIntoBox(parent, node)!
    const box = new THREE.Box3().setFromObject(placed)
    const size = box.getSize(new THREE.Vector3())
    // Uniform fit-inside against the limiting axis (width and depth both 2000, model 1000 -> x2).
    expect(size.x).toBeCloseTo(2000, 0)
    expect(size.z).toBeCloseTo(2000, 0)
    expect(size.y).toBeCloseTo(2000, 0) // scaled by the same factor, not stretched to 4000
    const center = box.getCenter(new THREE.Vector3())
    expect(center.x).toBeCloseTo(0, 0)
    expect(center.z).toBeCloseTo(0, 0)
    expect(box.min.y).toBeCloseTo(0, 0) // bottom-anchored to elevationZ
  })
})
