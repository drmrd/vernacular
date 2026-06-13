import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildScene } from './build-scene'
import { pickEntityId, pickEntityIdAt } from './pick-entity'
import type { SceneGraph } from '../../core'

const graph: SceneGraph = {
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
  walls: [
    {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
      thickness: 120,
      height: 2400,
    },
  ],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
}

describe('pickEntityId', () => {
  it('returns the entity id of the wall a ray strikes', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    raycaster.set(new THREE.Vector3(1000, 1200, 1000), new THREE.Vector3(0, 0, -1))
    expect(pickEntityId(raycaster, root)).toBe('wall:w1')
  })

  it('returns null when the ray strikes nothing', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    raycaster.set(new THREE.Vector3(9000, 9000, 9000), new THREE.Vector3(0, 0, -1))
    expect(pickEntityId(raycaster, root)).toBeNull()
  })
})

describe('pickEntityIdAt', () => {
  it('picks the wall under the centre of a camera aimed at it', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000)
    camera.position.set(1000, 1200, 4000)
    camera.lookAt(1000, 1200, 0)
    camera.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    expect(pickEntityIdAt({ raycaster, camera, root, ndc: { x: 0, y: 0 } })).toBe('wall:w1')
  })
})
