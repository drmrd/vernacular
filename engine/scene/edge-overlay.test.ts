import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { addEdgeOverlay } from './edge-overlay'

const edgeChildren = (object: THREE.Object3D): THREE.LineSegments[] =>
  object.children.filter(
    (child): child is THREE.LineSegments => child instanceof THREE.LineSegments,
  )

describe('addEdgeOverlay', () => {
  it('gives every mesh one edge-line child and leaves non-meshes alone', () => {
    const root = new THREE.Group()
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(50, 50, 50))
    const plainGroup = new THREE.Group()
    root.add(meshA, plainGroup)
    meshA.add(meshB) // a nested mesh is covered too

    addEdgeOverlay(root)

    expect(edgeChildren(meshA)).toHaveLength(1)
    expect(edgeChildren(meshB)).toHaveLength(1)
    expect(plainGroup.children).toHaveLength(0)
    expect(edgeChildren(meshA)[0]?.geometry).toBeInstanceOf(THREE.EdgesGeometry)
  })
})
