import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { furnitureFootprintCorners } from '../../core'
import {
  buildFurnitureModelGroup,
  normalizeModelIntoBox,
  parseFurnitureModel,
} from './furniture-model'

const CUBE_GLB = resolve(dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/cube.glb')

function nodeFor({
  width,
  depth,
  height,
  elevationZ = 0,
}: {
  width: number
  depth: number
  height: number
  elevationZ?: number
}) {
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
    const node = nodeFor({ width: 2000, depth: 2000, height: 4000, elevationZ: 500 }) // target taller and wider than the model

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
    expect(box.min.y).toBeCloseTo(500, 0) // bottom-anchored to elevationZ
  })

  it('returns null when the model has no geometry', () => {
    const empty = new THREE.Group()
    expect(
      normalizeModelIntoBox(empty, nodeFor({ width: 1000, depth: 1000, height: 1000 })),
    ).toBeNull()
  })
})

describe('parseFurnitureModel', () => {
  it('resolves to a THREE.Object3D when given a valid GLB', async () => {
    const bytes = new Uint8Array(readFileSync(CUBE_GLB))
    const model = await parseFurnitureModel(bytes)
    expect(model).toBeInstanceOf(THREE.Object3D)
  })

  it('rejects when given bytes that are not a valid GLB', async () => {
    await expect(parseFurnitureModel(new Uint8Array([1, 2, 3, 4]))).rejects.toBeTruthy()
  })
})

describe('buildFurnitureModelGroup', () => {
  it('builds a selectable furniture model group that mirrors the box ids', () => {
    const model = new THREE.Mesh(new THREE.BoxGeometry(500, 500, 500))
    const node = nodeFor({ width: 1000, depth: 1000, height: 1000 })
    const group = buildFurnitureModelGroup(model, node)
    expect(group.name).toBe(node.id)
    expect(group.userData.entityId).toBe('x') // raw id, the 'furniture:' prefix stripped
    expect(group.getObjectByProperty('isMesh', true)).toBeTruthy()
    let lineSegments = 0
    group.traverse((o) => {
      if ((o as THREE.LineSegments).isLineSegments) lineSegments += 1
    })
    expect(lineSegments).toBe(0) // no box edge overlay on the real mesh
  })
})
