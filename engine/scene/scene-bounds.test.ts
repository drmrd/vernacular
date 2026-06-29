import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import { addGroundPlane } from './ground-plane'
import { sceneBounds } from './scene-bounds'

const BUILDING_WIDTH_MM = 4000
const BUILDING_DEPTH_MM = 3000
const BUILDING_HEIGHT_MM = 2400

const buildingMesh = (): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(BUILDING_WIDTH_MM, BUILDING_HEIGHT_MM, BUILDING_DEPTH_MM),
  )
  // Span x in [0, 4000], y in [0, 2400], z in [0, 3000].
  mesh.position.set(BUILDING_WIDTH_MM / 2, BUILDING_HEIGHT_MM / 2, BUILDING_DEPTH_MM / 2)
  return mesh
}

describe('sceneBounds with a ground plane', () => {
  it('frames the building geometry and ignores the surrounding ground plane', () => {
    const root = new THREE.Group()
    const building = buildingMesh()
    root.add(building)
    addGroundPlane(root)

    root.updateMatrixWorld(true)
    const buildingBox = new THREE.Box3().setFromObject(building)
    const bounds = sceneBounds(root)

    expect(bounds).not.toBeNull()
    if (!bounds) return
    // The ground plane spans the footprint plus a wide site margin; the camera
    // should still frame the building alone, so the bounds match the building box.
    expect(bounds.min.x).toBeCloseTo(buildingBox.min.x)
    expect(bounds.max.x).toBeCloseTo(buildingBox.max.x)
    expect(bounds.min.z).toBeCloseTo(buildingBox.min.z)
    expect(bounds.max.z).toBeCloseTo(buildingBox.max.z)
  })

  it('reports no bounds for a scene holding only the ground plane', () => {
    const root = new THREE.Group()
    addGroundPlane(root)

    expect(sceneBounds(root)).toBeNull()
  })
})
