import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import { GROUND_SURFACE_HEX } from '../../core'
import type { TextureAppearance } from '../loaders/image-texture-loader'
import { groundPlaneDepthBiasParameters } from '../materials/role-appearance'

import { addGroundPlane, isGroundPlane } from './ground-plane'

const BOX_WIDTH_MM = 4000
const BOX_DEPTH_MM = 3000
const BOX_HEIGHT_MM = 2400

const TILE_WIDTH_MM = 2000
const TILE_HEIGHT_MM = 1000

const WHITE_HEX = '#ffffff'

// A box spanning world x 0 to 4000 and z -3000 to 0, so the plane's center is off the origin.
const rootWithOffCenterBox = (): THREE.Group => {
  const root = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(BOX_WIDTH_MM, BOX_HEIGHT_MM, BOX_DEPTH_MM))
  box.position.set(BOX_WIDTH_MM / 2, BOX_HEIGHT_MM / 2, -BOX_DEPTH_MM / 2)
  root.add(box)
  return root
}

const groundMesh = (root: THREE.Object3D): THREE.Mesh => {
  const plane = root.children.find(isGroundPlane)
  if (!(plane instanceof THREE.Mesh)) throw new Error('the root holds no ground plane mesh')
  return plane
}

const groundMaterial = (root: THREE.Object3D): THREE.MeshStandardMaterial =>
  groundMesh(root).material as THREE.MeshStandardMaterial

const addedFlatGround = (): THREE.Group => {
  const root = rootWithOffCenterBox()
  addGroundPlane(root)
  return root
}

describe('addGroundPlane with an appearance', () => {
  const texture = new THREE.Texture()
  const appearance: TextureAppearance = {
    texture,
    tileSize: { width: TILE_WIDTH_MM, height: TILE_HEIGHT_MM },
  }

  it('draws the texture on white, one copy per tile, with copies fixed to the world origin', () => {
    const root = rootWithOffCenterBox()
    addGroundPlane(root, 0, appearance)
    const mesh = groundMesh(root)
    const material = groundMaterial(root)
    const flat = groundMaterial(addedFlatGround())

    expect(material.map).toBe(texture)
    expect(`#${material.color.getHexString()}`).toBe(WHITE_HEX)
    expect(texture.repeat.toArray()).toEqual([1, 1])
    expect(texture.offset.toArray()).toEqual([0, 0])
    expect(material).toMatchObject(groundPlaneDepthBiasParameters())
    expect(material.roughness).toBe(flat.roughness)
    expect(material.metalness).toBe(flat.metalness)

    mesh.updateMatrixWorld()
    const positions = mesh.geometry.getAttribute('position')
    const uvs = mesh.geometry.getAttribute('uv')
    expect(uvs.count).toBe(positions.count)
    for (let index = 0; index < positions.count; index += 1) {
      const world = new THREE.Vector3()
        .fromBufferAttribute(positions, index)
        .applyMatrix4(mesh.matrixWorld)
      expect(uvs.getX(index)).toBeCloseTo(world.x / TILE_WIDTH_MM)
      expect(uvs.getY(index)).toBeCloseTo(-world.z / TILE_HEIGHT_MM)
    }
  })
})

describe('addGroundPlane without an appearance', () => {
  it('keeps the flat lawn color with no map', () => {
    const material = groundMaterial(addedFlatGround())

    expect(material.map).toBeNull()
    expect(`#${material.color.getHexString()}`).toBe(GROUND_SURFACE_HEX)
  })
})
