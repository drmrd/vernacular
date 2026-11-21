import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { disposeObject, isCacheHeld, markCacheHeld, releaseCachedObject } from './dispose-object'

type Resource = THREE.BufferGeometry | THREE.Material | THREE.Texture

/** Counts the 'dispose' events three.js dispatches on each resource. */
function countFrees(resources: Resource[]): Map<Resource, number> {
  const counts = new Map<Resource, number>()
  for (const resource of resources) {
    counts.set(resource, 0)
    resource.addEventListener('dispose', () => {
      counts.set(resource, (counts.get(resource) ?? 0) + 1)
    })
  }
  return counts
}

function triangle(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  )
  return geometry
}

describe('disposeObject', () => {
  it('frees the geometry and material of a line, not only of a mesh', () => {
    const geometry = triangle()
    const material = new THREE.LineBasicMaterial()
    const root = new THREE.Group()
    root.add(new THREE.Line(geometry, material))
    const counts = countFrees([geometry, material])

    disposeObject(root)

    expect(counts.get(geometry)).toBe(1)
    expect(counts.get(material)).toBe(1)
  })

  it('frees a material shared by several meshes exactly once', () => {
    const material = new THREE.MeshBasicMaterial()
    const first = triangle()
    const second = triangle()
    const root = new THREE.Group()
    root.add(new THREE.Mesh(first, material), new THREE.Mesh(second, material))
    const counts = countFrees([material, first, second])

    disposeObject(root)

    expect(counts.get(material)).toBe(1)
    expect(counts.get(first)).toBe(1)
    expect(counts.get(second)).toBe(1)
  })

  it('frees a geometry shared by several meshes exactly once', () => {
    const geometry = triangle()
    const root = new THREE.Group()
    root.add(
      new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
      new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
    )
    const counts = countFrees([geometry])

    disposeObject(root)

    expect(counts.get(geometry)).toBe(1)
  })

  it('frees a material that fills several slots of one material array exactly once', () => {
    const shared = new THREE.MeshBasicMaterial()
    const other = new THREE.MeshBasicMaterial()
    const root = new THREE.Group()
    root.add(new THREE.Mesh(triangle(), [shared, other, shared]))
    const counts = countFrees([shared, other])

    disposeObject(root)

    expect(counts.get(shared)).toBe(1)
    expect(counts.get(other)).toBe(1)
  })

  it('frees an unheld texture on a material in the tree', () => {
    const texture = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({ map: texture })
    const root = new THREE.Group()
    root.add(new THREE.Mesh(triangle(), material))
    const counts = countFrees([texture])

    disposeObject(root)

    expect(counts.get(texture)).toBe(1)
  })

  it('frees a texture shared by two materials exactly once', () => {
    const texture = new THREE.Texture()
    const root = new THREE.Group()
    root.add(
      new THREE.Mesh(triangle(), new THREE.MeshStandardMaterial({ map: texture })),
      new THREE.Mesh(triangle(), new THREE.MeshStandardMaterial({ map: texture })),
    )
    const counts = countFrees([texture])

    disposeObject(root)

    expect(counts.get(texture)).toBe(1)
  })

  it('leaves a held geometry, material, and texture alone', () => {
    const geometry = triangle()
    const texture = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({ map: texture })
    markCacheHeld(geometry)
    markCacheHeld(material)
    markCacheHeld(texture)
    const root = new THREE.Group()
    root.add(new THREE.Mesh(geometry, material))
    const counts = countFrees([geometry, material, texture])

    disposeObject(root)

    expect(counts.get(geometry)).toBe(0)
    expect(counts.get(material)).toBe(0)
    expect(counts.get(texture)).toBe(0)
  })

  it('frees an unheld clone of a held material and leaves the held original', () => {
    const held = new THREE.MeshStandardMaterial()
    markCacheHeld(held)
    const clone = held.clone()
    const root = new THREE.Group()
    root.add(new THREE.Mesh(triangle(), clone))
    const counts = countFrees([held, clone])

    disposeObject(root)

    expect(isCacheHeld(clone)).toBe(false)
    expect(counts.get(clone)).toBe(1)
    expect(counts.get(held)).toBe(0)
  })
})

describe('releaseCachedObject', () => {
  it('frees held and unheld resources alike', () => {
    const heldGeometry = triangle()
    const heldTexture = new THREE.Texture()
    const heldMaterial = new THREE.MeshStandardMaterial({ map: heldTexture })
    const unheldGeometry = triangle()
    const unheldMaterial = new THREE.MeshBasicMaterial()
    markCacheHeld(heldGeometry)
    markCacheHeld(heldMaterial)
    markCacheHeld(heldTexture)
    const root = new THREE.Group()
    root.add(
      new THREE.Mesh(heldGeometry, heldMaterial),
      new THREE.Mesh(unheldGeometry, unheldMaterial),
    )
    const counts = countFrees([
      heldGeometry,
      heldMaterial,
      heldTexture,
      unheldGeometry,
      unheldMaterial,
    ])

    releaseCachedObject(root)

    for (const count of counts.values()) {
      expect(count).toBe(1)
    }
  })
})
