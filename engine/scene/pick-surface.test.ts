import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildScene } from './build-scene'
import { pickSurface, pickSurfaceAt } from './pick-surface'
import type { RoomSceneNode, SceneGraph } from '../../core'

const SQUARE = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 2000 },
  { x: 0, y: 2000 },
]

const room: RoomSceneNode = {
  id: 'room:r1',
  kind: 'room',
  floorId: 'g',
  polygon: SQUARE,
  clearPolygon: SQUARE,
  area: 2000 * 2000,
}

const graph: SceneGraph = {
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
  walls: [],
  rooms: [room],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

describe('pickSurface', () => {
  it("returns a room floor's surface ref when a ray strikes the slab top", () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    raycaster.set(new THREE.Vector3(1000, 5000, 1000), new THREE.Vector3(0, -1, 0))
    expect(pickSurface(raycaster, root)).toEqual({ kind: 'floor', floorId: 'g' })
  })

  it('returns null when the ray strikes nothing', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    raycaster.set(new THREE.Vector3(9000, 9000, 9000), new THREE.Vector3(0, 0, -1))
    expect(pickSurface(raycaster, root)).toBeNull()
  })
})

describe('pickSurfaceAt', () => {
  it('picks the floor under a camera aimed straight down at it', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000)
    camera.position.set(1000, 5000, 1000)
    camera.lookAt(1000, 0, 1000)
    camera.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    expect(pickSurfaceAt({ raycaster, camera, root, ndc: { x: 0, y: 0 } })).toEqual({
      kind: 'floor',
      floorId: 'g',
    })
  })
})
