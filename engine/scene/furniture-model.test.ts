import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { furnitureFootprintCorners } from '../../core'
import {
  buildFurnitureModelGroup,
  hasUsableGeometry,
  normalizeModelIntoBox,
  parseFurnitureModel,
  UnusableFurnitureModelError,
} from './furniture-model'

const CUBE_GLB = resolve(dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/cube.glb')

const GLTF_ASSET = { version: '2.0' }
const FLOAT_BYTES = 4
const FLOAT_COMPONENT_TYPE = 5126
const VERTEX_COUNT = 3
const POSITION_ATTRIBUTE = 'POSITION' // glTF attribute names are upper case by specification

function gltfBytes(gltf: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(gltf))
}

/** A glTF with one triangle whose three vertices all have z = 0, so the model has no depth. */
function flatTriangleBytes(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const base64 = Buffer.from(positions.buffer).toString('base64')
  return gltfBytes({
    asset: GLTF_ASSET,
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { [POSITION_ATTRIBUTE]: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: FLOAT_COMPONENT_TYPE,
        count: VERTEX_COUNT,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
    bufferViews: [{ buffer: 0, byteLength: positions.length * FLOAT_BYTES }],
    buffers: [
      {
        byteLength: positions.length * FLOAT_BYTES,
        uri: `data:application/octet-stream;base64,${base64}`,
      },
    ],
  })
}

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

describe('hasUsableGeometry', () => {
  it('is false for an empty group', () => {
    expect(hasUsableGeometry(new THREE.Group())).toBe(false)
  })

  it('is false for a group that holds only a light and a camera', () => {
    const group = new THREE.Group()
    group.add(new THREE.PointLight(), new THREE.PerspectiveCamera())
    expect(hasUsableGeometry(group)).toBe(false)
  })

  it('is false for a mesh that is flat on one axis', () => {
    const flat = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000)) // no extent along z
    expect(hasUsableGeometry(flat)).toBe(false)
  })

  it('is true for a box mesh', () => {
    expect(hasUsableGeometry(new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000)))).toBe(true)
  })

  it('is true for a box mesh under a parent with a non-identity transform', () => {
    const parent = new THREE.Group()
    parent.position.set(50, 50, 50)
    parent.scale.set(2, 2, 2)
    parent.add(new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000)))
    expect(hasUsableGeometry(parent)).toBe(true)
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

  it('rejects with UnusableFurnitureModelError when the scene holds only empty nodes', async () => {
    const bytes = gltfBytes({
      asset: GLTF_ASSET,
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'empty' }],
    })
    await expect(parseFurnitureModel(bytes)).rejects.toBeInstanceOf(UnusableFurnitureModelError)
  })

  it('rejects a flat triangle with UnusableFurnitureModelError and disposes its geometry', async () => {
    const disposeSpy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    try {
      await expect(parseFurnitureModel(flatTriangleBytes())).rejects.toBeInstanceOf(
        UnusableFurnitureModelError,
      )
      expect(disposeSpy).toHaveBeenCalled()
    } finally {
      disposeSpy.mockRestore()
    }
  })
})

describe('buildFurnitureModelGroup', () => {
  it('builds a selectable furniture model group that mirrors the box ids', () => {
    const model = new THREE.Mesh(new THREE.BoxGeometry(500, 500, 500))
    const node = nodeFor({ width: 1000, depth: 1000, height: 1000 })
    const group = buildFurnitureModelGroup(model, node)
    expect(group.name).toBe(node.id)
    expect(group.userData.entityId).toBe('x') // raw id, the 'furniture:' prefix stripped
    expect(group.getObjectByProperty('isMesh', true)).toBeInstanceOf(THREE.Mesh)
    expect(group.getObjectByProperty('isLineSegments', true)).toBeUndefined() // no box edge overlay on the real mesh
  })
})
