import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { disposeObject } from '../index'
import { countFrees } from './dispose-count-test-support'

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
