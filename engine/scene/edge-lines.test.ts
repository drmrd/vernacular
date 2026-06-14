import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { edgeLines } from './edge-lines'

describe('edgeLines', () => {
  it('builds a LineSegments tracing the geometry edges with the given material', () => {
    const box = new THREE.BoxGeometry(100, 200, 50)
    const material = new THREE.LineBasicMaterial()

    const line = edgeLines(box, material)

    expect(line).toBeInstanceOf(THREE.LineSegments)
    expect(line.material).toBe(material)
    expect(line.geometry).toBeInstanceOf(THREE.EdgesGeometry)
    // A box has 12 edges, two line vertices each.
    expect(line.geometry.getAttribute('position').count).toBe(24)
  })
})
