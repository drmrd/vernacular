import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  createFloor,
  createFurnitureInstance,
  deriveFurnitureNode,
  type FurnitureSceneNode,
} from '../../core'
import { worldToPlan } from '../../core/scene/plan-to-world'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'

import { assembleFloorRoot } from './floor-subgroups'
import { buildFurnitureMassing } from './furniture-builder'
import { buildFurnitureModelGroup } from './furniture-model'

// A piece placed away from the origin and turned by an angle that is not a multiple of 90
// degrees, so a mirrored axis or a flipped rotation sign moves the model off the box.
const POSITION = { x: 3200, y: 1700 }
const ROTATION_DEGREES = 30
const FOOTPRINT = { width: 1200, depth: 600 }
const HEIGHT = 750
const ELEVATION_Z = 0
const FLOOR_ELEVATION = 2800

// The model body fills the whole footprint; a marker block rides on its +X end, so the model's
// bounds equal the footprint exactly (scale 1) and the marker shows which end is which.
const BODY_HEIGHT = 600
const MARKER_SIZE = 200
const MARKER_HEIGHT = HEIGHT - BODY_HEIGHT
const MARKER_OFFSET_X = FOOTPRINT.width / 2 - MARKER_SIZE / 2
const MARKER_NAME = 'marker'
const RADIANS_PER_DEGREE = Math.PI / 180

function asymmetricModel(): THREE.Group {
  const body = new THREE.Mesh(new THREE.BoxGeometry(FOOTPRINT.width, BODY_HEIGHT, FOOTPRINT.depth))
  const marker = new THREE.Mesh(new THREE.BoxGeometry(MARKER_SIZE, MARKER_HEIGHT, MARKER_SIZE))
  marker.name = MARKER_NAME
  marker.position.set(MARKER_OFFSET_X, (BODY_HEIGHT + MARKER_HEIGHT) / 2, 0)
  const model = new THREE.Group()
  model.add(body, marker)
  return model
}

function furnitureNode(): FurnitureSceneNode {
  const instance = createFurnitureInstance({
    assetRef: { scope: 'user', contentHash: 'placement' },
    position: POSITION,
    footprint: FOOTPRINT,
    rotation: ROTATION_DEGREES,
    elevationZ: ELEVATION_Z,
    height: HEIGHT,
  })
  return deriveFurnitureNode(createFloor('Ground'), instance)
}

/** Seats both sub-groups under one floor root, as the framed scene does, and refreshes matrices. */
function seatInFloor(...subgroups: THREE.Object3D[]): void {
  const floorNode = {
    id: 'floor:placement',
    kind: 'floor',
    name: 'Ground',
    elevation: FLOOR_ELEVATION,
  } as const
  assembleFloorRoot(floorNode, subgroups).updateMatrixWorld(true)
}

function rounded(vector: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: Math.round(vector.x), y: Math.round(vector.y), z: Math.round(vector.z) }
}

describe('loaded furniture model placement', () => {
  it('lands on the same world bounds and orientation as the furniture box for the same node', () => {
    const node = furnitureNode()
    const box = buildFurnitureMassing(node, new NeutralMaterialProvider())
    const modelGroup = buildFurnitureModelGroup(asymmetricModel(), node)
    seatInFloor(box, modelGroup)

    const boxBounds = new THREE.Box3().setFromObject(box)
    const modelBounds = new THREE.Box3().setFromObject(modelGroup)

    expect.soft(rounded(modelBounds.min)).toEqual(rounded(boxBounds.min))
    expect.soft(rounded(modelBounds.max)).toEqual(rounded(boxBounds.max))

    // The marker sits on the model's +X end, which the fit maps to the footprint's width
    // direction (top-left to top-right corner), so in plan it lands toward that end.
    const marker = modelGroup.getObjectByName(MARKER_NAME) as THREE.Object3D
    const markerWorld = marker.getWorldPosition(new THREE.Vector3())
    const markerPlan = worldToPlan(markerWorld)
    const radians = ROTATION_DEGREES * RADIANS_PER_DEGREE
    const expectedMarkerPlan = {
      x: POSITION.x + MARKER_OFFSET_X * Math.cos(radians),
      y: POSITION.y + MARKER_OFFSET_X * Math.sin(radians),
    }
    expect.soft(Math.round(markerPlan.x)).toBe(Math.round(expectedMarkerPlan.x))
    expect.soft(Math.round(markerPlan.y)).toBe(Math.round(expectedMarkerPlan.y))
  })
})
