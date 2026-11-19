import { describe, it, expect } from 'vitest'
import type { Bounds3 } from './vector3'
import type { OpeningSceneNode } from './scene-graph'
import { planToWorld } from './plan-to-world'
import {
  frameSceneCamera,
  DEFAULT_CAMERA_POSE,
  type CameraPose,
  type CameraViewport,
} from './camera-framing'
import { cameraPresetPose, doorwayPose } from './camera-presets'

const houseBounds: Bounds3 = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 4000, y: 2438, z: 3000 },
}

const CENTER = { x: 2000, y: 1219, z: 1500 }
const VIEWPORT: CameraViewport = { aspect: 16 / 9, fovRadians: (75 * Math.PI) / 180 }
const POSITION_TOLERANCE = 1e-6
const FILL_FRACTION = 0.8

function diagonalOf(bounds: Bounds3): number {
  return Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  )
}

function limitingHalfAngle(viewport: CameraViewport): number {
  const halfV = viewport.fovRadians / 2
  const halfH = Math.atan(Math.tan(viewport.fovRadians / 2) * viewport.aspect)
  return Math.min(halfV, halfH)
}

describe('cameraPresetPose top-down view', () => {
  it('targets the center of the bounds', () => {
    const pose: CameraPose = cameraPresetPose('top', houseBounds, VIEWPORT)
    expect(pose.target).toEqual(CENTER)
  })

  it('places the camera directly above the center looking straight down', () => {
    const pose = cameraPresetPose('top', houseBounds, VIEWPORT)
    expect(Math.abs(pose.position.x - CENTER.x)).toBeLessThan(POSITION_TOLERANCE)
    expect(Math.abs(pose.position.z - CENTER.z)).toBeLessThan(POSITION_TOLERANCE)
    expect(pose.position.y).toBeGreaterThan(CENTER.y)
  })

  it('sets the up vector to world -Z so plan-north sits at the top of the pane', () => {
    const pose = cameraPresetPose('top', houseBounds, VIEWPORT)
    expect(pose.up).toEqual({ x: 0, y: 0, z: -1 })
  })

  it('derives near and far from the bounds diagonal, matching the framed view', () => {
    const pose = cameraPresetPose('top', houseBounds, VIEWPORT)
    const framed = frameSceneCamera(houseBounds)
    expect(pose.near).toBe(framed.near)
    expect(pose.far).toBe(framed.far)
  })

  it('fits the bounding sphere to the viewport without leaving it tiny', () => {
    const pose = cameraPresetPose('top', houseBounds, VIEWPORT)
    const distance = pose.position.y - CENTER.y
    const radius = diagonalOf(houseBounds) / 2
    const angularRadius = Math.asin(radius / distance)
    const halfAngle = limitingHalfAngle(VIEWPORT)
    expect(angularRadius).toBeLessThanOrEqual(halfAngle)
    expect(angularRadius).toBeGreaterThanOrEqual(halfAngle * FILL_FRACTION)
  })

  it('returns the fixed default pose for an empty scene (null bounds)', () => {
    expect(cameraPresetPose('top', null)).toEqual(DEFAULT_CAMERA_POSE)
  })

  it('returns the fixed default pose for degenerate (zero-size) bounds', () => {
    const degenerate: Bounds3 = { min: { x: 1, y: 1, z: 1 }, max: { x: 1, y: 1, z: 1 } }
    expect(cameraPresetPose('top', degenerate)).toEqual(DEFAULT_CAMERA_POSE)
  })
})

describe('cameraPresetPose elevations', () => {
  const elevations = [
    { preset: 'north' as const, axis: 'z' as const, sign: -1 },
    { preset: 'south' as const, axis: 'z' as const, sign: 1 },
    { preset: 'east' as const, axis: 'x' as const, sign: 1 },
    { preset: 'west' as const, axis: 'x' as const, sign: -1 },
  ]

  for (const { preset, axis, sign } of elevations) {
    describe(`the ${preset} elevation`, () => {
      it('targets the center of the bounds', () => {
        const pose: CameraPose = cameraPresetPose(preset, houseBounds, VIEWPORT)
        expect(pose.target).toEqual(CENTER)
      })

      it('keeps the up vector pointing toward world +Y', () => {
        const pose = cameraPresetPose(preset, houseBounds, VIEWPORT)
        expect(pose.up).toEqual({ x: 0, y: 1, z: 0 })
      })

      it('places the camera on the named facade side at the center height', () => {
        const pose = cameraPresetPose(preset, houseBounds, VIEWPORT)
        if (sign < 0) {
          expect(pose.position[axis]).toBeLessThan(CENTER[axis])
        } else {
          expect(pose.position[axis]).toBeGreaterThan(CENTER[axis])
        }
        const inPlane = axis === 'x' ? 'z' : 'x'
        expect(Math.abs(pose.position[inPlane] - CENTER[inPlane])).toBeLessThan(POSITION_TOLERANCE)
        expect(Math.abs(pose.position.y - CENTER.y)).toBeLessThan(POSITION_TOLERANCE)
      })

      it('derives near and far from the bounds diagonal, matching the framed view', () => {
        const pose = cameraPresetPose(preset, houseBounds, VIEWPORT)
        const framed = frameSceneCamera(houseBounds)
        expect(pose.near).toBe(framed.near)
        expect(pose.far).toBe(framed.far)
      })

      it('fits the bounding sphere to the viewport without leaving it tiny', () => {
        const pose = cameraPresetPose(preset, houseBounds, VIEWPORT)
        const distance = Math.hypot(
          pose.position.x - CENTER.x,
          pose.position.y - CENTER.y,
          pose.position.z - CENTER.z,
        )
        const radius = diagonalOf(houseBounds) / 2
        const angularRadius = Math.asin(radius / distance)
        const halfAngle = limitingHalfAngle(VIEWPORT)
        expect(angularRadius).toBeLessThanOrEqual(halfAngle)
        expect(angularRadius).toBeGreaterThanOrEqual(halfAngle * FILL_FRACTION)
      })
    })
  }
})

const GROUND_FLOOR_ELEVATION_MM = 0
const UPPER_FLOOR_ELEVATION_MM = 3000
const STOREY_HEIGHT_MM = 3000

function makeDoor(normal: { x: number; y: number }): OpeningSceneNode {
  return {
    id: 'door-north',
    kind: 'opening',
    floorId: 'floor-1',
    type: 'door',
    center: { x: 2000, y: 0 },
    along: { x: 1, y: 0 },
    normal,
    width: 900,
    height: 2032,
    sillHeight: 0,
    hostThickness: 150,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

describe('doorwayPose', () => {
  const HORIZONTAL_TOLERANCE = 1e-6
  const BASEMENT_FLOOR_ELEVATION_MM = -3000
  const DOOR_EYE_HEIGHT_MM = 1016

  const outwardDoor = makeDoor({ x: 0, y: -1 })
  const eye = outwardDoor.sillHeight + outwardDoor.height / 2

  it('stands at the opening center raised to the vertical middle of the opening', () => {
    const pose = doorwayPose(outwardDoor, houseBounds, GROUND_FLOOR_ELEVATION_MM)
    expect(pose.position).toEqual(planToWorld(outwardDoor.center, eye))
    expect(pose.position).toEqual({ x: 2000, y: 1016, z: 0 })
  })

  it('looks horizontally so the eye holds its height across the opening', () => {
    const pose = doorwayPose(outwardDoor, houseBounds, GROUND_FLOOR_ELEVATION_MM)
    expect(Math.abs(pose.target.y - pose.position.y)).toBeLessThan(HORIZONTAL_TOLERANCE)
  })

  it('keeps the up vector pointing toward world +Y', () => {
    const pose = doorwayPose(outwardDoor, houseBounds, GROUND_FLOOR_ELEVATION_MM)
    expect(pose.up).toEqual({ x: 0, y: 1, z: 0 })
  })

  it('derives near and far from the bounds diagonal, matching the framed view', () => {
    const pose = doorwayPose(outwardDoor, houseBounds, GROUND_FLOOR_ELEVATION_MM)
    const framed = frameSceneCamera(houseBounds)
    expect(pose.near).toBe(framed.near)
    expect(pose.far).toBe(framed.far)
  })

  it('returns the fixed default pose for an empty scene (null bounds)', () => {
    expect(doorwayPose(outwardDoor, null, GROUND_FLOOR_ELEVATION_MM)).toEqual(DEFAULT_CAMERA_POSE)
  })

  it('returns the fixed default pose for degenerate (zero-size) bounds', () => {
    const degenerate: Bounds3 = { min: { x: 1, y: 1, z: 1 }, max: { x: 1, y: 1, z: 1 } }
    expect(doorwayPose(outwardDoor, degenerate, GROUND_FLOOR_ELEVATION_MM)).toEqual(
      DEFAULT_CAMERA_POSE,
    )
  })

  it('returns the fixed default pose when the wall normal has zero length', () => {
    const facelessDoor = makeDoor({ x: 0, y: 0 })
    expect(doorwayPose(facelessDoor, houseBounds, GROUND_FLOOR_ELEVATION_MM)).toEqual(
      DEFAULT_CAMERA_POSE,
    )
  })

  function boundsOfOneStoreyAt(elevationMm: number): Bounds3 {
    return {
      min: { x: 0, y: elevationMm, z: 0 },
      max: { x: 4000, y: elevationMm + 2438, z: STOREY_HEIGHT_MM },
    }
  }

  it('stands at the vertical middle of the opening above its own floor when that floor sits 3000 mm up', () => {
    const bounds = boundsOfOneStoreyAt(UPPER_FLOOR_ELEVATION_MM)
    const pose = doorwayPose(outwardDoor, bounds, UPPER_FLOOR_ELEVATION_MM)
    const expectedEyeY = UPPER_FLOOR_ELEVATION_MM + DOOR_EYE_HEIGHT_MM
    expect(pose.position).toEqual({ x: 2000, y: expectedEyeY, z: 0 })
    expect(pose.target.y).toBe(expectedEyeY)
  })

  it('stands at the vertical middle of the opening above its own floor in a basement 3000 mm below the ground', () => {
    const bounds = boundsOfOneStoreyAt(BASEMENT_FLOOR_ELEVATION_MM)
    const pose = doorwayPose(outwardDoor, bounds, BASEMENT_FLOOR_ELEVATION_MM)
    const expectedEyeY = BASEMENT_FLOOR_ELEVATION_MM + DOOR_EYE_HEIGHT_MM
    expect(pose.position).toEqual({ x: 2000, y: expectedEyeY, z: 0 })
    expect(pose.target.y).toBe(expectedEyeY)
  })
})

describe('doorwayPose: the look side', () => {
  const LOOK_DIGITS = 9

  function expectLook(pose: CameraPose, expected: { x: number; z: number }): void {
    expect(pose.target.x - pose.position.x).toBeCloseTo(expected.x, LOOK_DIGITS)
    expect(pose.target.y - pose.position.y).toBeCloseTo(0, LOOK_DIGITS)
    expect(pose.target.z - pose.position.z).toBeCloseTo(expected.z, LOOK_DIGITS)
  }

  const upperRoomDoor: OpeningSceneNode = {
    ...makeDoor({ x: 1, y: 0 }),
    center: { x: 8000, y: 1500 },
    along: { x: 0, y: -1 },
    roomSide: 'positive',
    orientation: { hinge: 'start', facing: 'negative' },
  }
  const wholeBuildingBounds: Bounds3 = {
    min: { x: 0, y: 0, z: -STOREY_HEIGHT_MM },
    max: { x: 10000, y: 5438, z: 0 },
  }
  const upperFloorBounds: Bounds3 = {
    min: { x: 8000, y: UPPER_FLOOR_ELEVATION_MM, z: -STOREY_HEIGHT_MM },
    max: { x: 10000, y: 5438, z: 0 },
  }

  it("looks into the room on the door's room side in the whole-building view, where the centre of the shown bounds lies outside that room", () => {
    const pose = doorwayPose(upperRoomDoor, wholeBuildingBounds, UPPER_FLOOR_ELEVATION_MM)
    expectLook(pose, { x: 1, z: 0 })
  })

  it('looks plan north, world -Z, when the room side is the side opposite a normal that points plan south', () => {
    const door: OpeningSceneNode = { ...makeDoor({ x: 0, y: -1 }), roomSide: 'negative' }
    const pose = doorwayPose(door, houseBounds, GROUND_FLOOR_ELEVATION_MM)
    expectLook(pose, { x: 0, z: -1 })
  })

  it('looks straight through a door in a wall at 45 degrees to the plan axes', () => {
    const door: OpeningSceneNode = {
      ...makeDoor({ x: Math.SQRT1_2, y: -Math.SQRT1_2 }),
      center: { x: 500, y: 2500 },
      along: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
      roomSide: 'positive',
    }
    const bounds: Bounds3 = {
      min: { x: 0, y: 0, z: -STOREY_HEIGHT_MM },
      max: { x: 4000, y: 2438, z: 0 },
    }
    const pose = doorwayPose(door, bounds, GROUND_FLOOR_ELEVATION_MM)
    expectLook(pose, { x: Math.SQRT1_2, z: Math.SQRT1_2 })
  })

  it('gives the door of an upper room the same look in the floor view and in the whole-building view', () => {
    const floorView = doorwayPose(upperRoomDoor, upperFloorBounds, UPPER_FLOOR_ELEVATION_MM)
    const wholeBuilding = doorwayPose(upperRoomDoor, wholeBuildingBounds, UPPER_FLOOR_ELEVATION_MM)
    expectLook(wholeBuilding, {
      x: floorView.target.x - floorView.position.x,
      z: floorView.target.z - floorView.position.z,
    })
  })

  const interiorDoor = (facing: 'positive' | 'negative'): OpeningSceneNode => ({
    ...makeDoor({ x: -1, y: 0 }),
    center: { x: 4000, y: 1500 },
    along: { x: 0, y: 1 },
    orientation: { hinge: 'start', facing },
  })

  it('looks toward the side its leaf opens to when the door has no room side, whatever the centre of the shown bounds', () => {
    const bounds: Bounds3 = {
      min: { x: 0, y: 0, z: -STOREY_HEIGHT_MM },
      max: { x: 10000, y: 2438, z: 0 },
    }
    const pose = doorwayPose(interiorDoor('positive'), bounds, GROUND_FLOOR_ELEVATION_MM)
    expectLook(pose, { x: -1, z: 0 })
  })

  it('looks against the normal when the door has no room side and its leaf opens to the negative side', () => {
    const bounds: Bounds3 = {
      min: { x: 0, y: 0, z: -STOREY_HEIGHT_MM },
      max: { x: 6000, y: 2438, z: 0 },
    }
    const pose = doorwayPose(interiorDoor('negative'), bounds, GROUND_FLOOR_ELEVATION_MM)
    expectLook(pose, { x: 1, z: 0 })
  })
})
