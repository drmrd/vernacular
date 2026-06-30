import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { addEdgeOverlay, applyEdgeOverlay } from './edge-overlay'

const edgeChildren = (object: THREE.Object3D): THREE.LineSegments[] =>
  object.children.filter(
    (child): child is THREE.LineSegments => child instanceof THREE.LineSegments,
  )

const boxMeshInGroup = (): { root: THREE.Group; mesh: THREE.Mesh } => {
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
  root.add(mesh)
  return { root, mesh }
}

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

describe('applyEdgeOverlay', () => {
  it('leaves every mesh bare when no overlay option is given (the default is off)', () => {
    const { root, mesh } = boxMeshInGroup()

    applyEdgeOverlay(root)

    expect(edgeChildren(mesh)).toHaveLength(0)
  })

  it('leaves every mesh bare when the overlay option is explicitly off', () => {
    const { root, mesh } = boxMeshInGroup()

    applyEdgeOverlay(root, { edgeOverlay: false })

    expect(edgeChildren(mesh)).toHaveLength(0)
  })

  it('adds one edge line to each mesh when the overlay option is on', () => {
    const { root, mesh } = boxMeshInGroup()

    applyEdgeOverlay(root, { edgeOverlay: true })

    expect(edgeChildren(mesh)).toHaveLength(1)
  })
})
