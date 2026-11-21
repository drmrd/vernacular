import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { disposeObject } from '../index'

type Resource = THREE.BufferGeometry | THREE.Material

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

function singlePoint(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
  return geometry
}

describe('disposeObject as exported by the engine package', () => {
  it('frees the geometry and material of a line in the tree', () => {
    const geometry = singlePoint()
    const material = new THREE.LineBasicMaterial()
    const root = new THREE.Group()
    root.add(new THREE.Line(geometry, material))
    const counts = countFrees([geometry, material])

    disposeObject(root)

    expect(counts.get(geometry)).toBe(1)
    expect(counts.get(material)).toBe(1)
  })

  it('frees the geometry and material of a points object in the tree', () => {
    const geometry = singlePoint()
    const material = new THREE.PointsMaterial()
    const root = new THREE.Group()
    root.add(new THREE.Points(geometry, material))
    const counts = countFrees([geometry, material])

    disposeObject(root)

    expect(counts.get(geometry)).toBe(1)
    expect(counts.get(material)).toBe(1)
  })
})
