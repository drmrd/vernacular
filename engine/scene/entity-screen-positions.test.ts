import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildScene } from './build-scene'
import { entityScreenPositions } from './entity-screen-positions'
import type { SceneGraph } from '../../core'

const SIZE = 320

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

function aimedCamera(target: THREE.Vector3): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000)
  camera.position.set(1000, 1200, 4000)
  camera.lookAt(target)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

describe('entityScreenPositions', () => {
  it('projects an entity centre to roughly the middle when the camera faces it', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const camera = aimedCamera(new THREE.Vector3(1000, 1200, 0))

    const positions = entityScreenPositions(root, camera, { width: SIZE, height: SIZE })

    const wall = positions.find((position) => position.id === 'wall:w1')
    expect(wall).toBeDefined()
    expect(Math.abs((wall?.x ?? 0) - SIZE / 2)).toBeLessThan(SIZE / 4)
    expect(Math.abs((wall?.y ?? 0) - SIZE / 2)).toBeLessThan(SIZE / 4)
  })

  it('omits an entity behind the camera', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const camera = aimedCamera(new THREE.Vector3(1000, 1200, 8000)) // looking away from the wall

    const positions = entityScreenPositions(root, camera, { width: SIZE, height: SIZE })

    expect(positions.find((position) => position.id === 'wall:w1')).toBeUndefined()
  })
})
