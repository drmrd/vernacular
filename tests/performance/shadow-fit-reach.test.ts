import { describe, expect, it } from 'vitest'
import { createEditorSession } from '../../session/testing'
import { createFramedSceneReconciler } from '../../bridge/react/framed-scene-reconciler'
import {
  MAX_SHADOW_TEXEL_MM,
  boundsRadius,
  createEmptyProject,
  createFloor,
  createWall,
  shadowFitBounds,
  type Bounds3,
  type Floor,
  type Point,
  type Project,
  type Vector3,
} from '../../core'
import { SHADOW_MAP_SIZE, groundExtent } from '../../engine'
import { createReferenceProject } from './reference-project'

/** The sun that casts the longest shadow of the winter afternoon, from the scene toward the sun. */
const WINTER_AFTERNOON_SUN: Vector3 = { x: -0.798, y: 0.0911, z: 0.5957 }
const NO_CAP = 1e12
const DOUBLED_FOOTPRINT = 2
/**
 * A footprint factor that leaves the casters under the cap radius and the uncapped fit over it.
 * At 1.2 the casters measure about 14718 mm, the cap radius is 15872 mm, and the uncapped fit
 * measures about 17883 mm.
 */
const FOOTPRINT_BETWEEN_CAP_AND_UNCAPPED = 1.2

const HOUSE_FLOOR_COUNT = 6
const HOUSE_WIDTH_MM = 60000
const HOUSE_DEPTH_MM = 40000
const HOUSE_STOREY_MM = 3000

interface Framing {
  casters: Bounds3
  ground: Bounds3
}

/** The framed scene of the project, as the application builds it: its casters and its lawn. */
function frame(project: Project): Framing {
  const session = createEditorSession(project)
  const scene = createFramedSceneReconciler().reconcile(
    session.getSceneGraph(),
    project.paint ?? {},
  )
  const ground = groundExtent(scene.root)
  expect(ground, 'the framed scene holds a ground plane').not.toBeNull()
  expect(scene.bounds, 'the framed scene has casters').not.toBeNull()
  return { casters: scene.bounds as Bounds3, ground: ground as Bounds3 }
}

function fit(framing: Framing, maxRadius: number): Bounds3 {
  return shadowFitBounds({ ...framing, sunDirection: WINTER_AFTERNOON_SUN, maxRadius })
}

function texelSizeMm(bounds: Bounds3): number {
  return (2 * boundsRadius(bounds)) / SHADOW_MAP_SIZE
}

function capRadius(): number {
  return (MAX_SHADOW_TEXEL_MM * SHADOW_MAP_SIZE) / 2
}

function contains(outer: Bounds3, inner: Bounds3): boolean {
  const axes = ['x', 'y', 'z'] as const
  return axes.every(
    (axis) => outer.min[axis] <= inner.min[axis] && outer.max[axis] >= inner.max[axis],
  )
}

function numbersOf({ min, max }: Bounds3): number[] {
  return [min.x, min.y, min.z, max.x, max.y, max.z]
}

/** The same box with its width and depth multiplied by the factor, the near corner kept. */
function scaleFootprint(bounds: Bounds3, factor: number): Bounds3 {
  const width = bounds.max.x - bounds.min.x
  const depth = bounds.max.z - bounds.min.z
  return {
    min: { ...bounds.min },
    max: {
      ...bounds.max,
      x: bounds.max.x + width * (factor - 1),
      z: bounds.max.z + depth * (factor - 1),
    },
  }
}

/** The framing with the casters grown by the factor and the lawn grown by the same amount. */
function scaledFraming({ casters, ground }: Framing, factor: number): Framing {
  const grownCasters = scaleFootprint(casters, factor)
  const growthX = grownCasters.max.x - casters.max.x
  const growthZ = grownCasters.max.z - casters.max.z
  const grownGround: Bounds3 = {
    min: { ...ground.min },
    max: { ...ground.max, x: ground.max.x + growthX, z: ground.max.z + growthZ },
  }
  return { casters: grownCasters, ground: grownGround }
}

function rectangleWalls(floorId: string): Floor['walls'] {
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: HOUSE_WIDTH_MM, y: 0 },
    { x: HOUSE_WIDTH_MM, y: HOUSE_DEPTH_MM },
    { x: 0, y: HOUSE_DEPTH_MM },
  ]
  return corners.map((start, index) =>
    createWall(
      { ...start },
      { ...(corners[(index + 1) % corners.length] as Point) },
      {
        id: `${floorId}-wall-${index + 1}`,
      },
    ),
  )
}

function houseFloor(index: number): Floor {
  const id = `house-floor-${index + 1}`
  return createFloor(`House floor ${index + 1}`, {
    id,
    elevation: index * HOUSE_STOREY_MM,
    defaultCeilingHeight: HOUSE_STOREY_MM,
    walls: rectangleWalls(id),
  })
}

function houseProject(floors: readonly Floor[]): Project {
  const project = createEmptyProject({
    name: 'Six-floor house',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  project.floors = [...floors]
  return project
}

function measuredReferenceFraming(): Framing {
  return frame(createReferenceProject())
}

function neededTexelSizeMm(framing: Framing): number {
  return texelSizeMm(fit(framing, NO_CAP))
}

describe('the cap on the size of a shadow texel', () => {
  it('is the texel size that the reference project needs, rounded up to half a millimetre', () => {
    const needed = neededTexelSizeMm(measuredReferenceFraming())

    expect(MAX_SHADOW_TEXEL_MM).toBe(Math.ceil(needed * 2) / 2)
  })

  it('keeps the whole lawn shadow of the reference project', () => {
    const framing = measuredReferenceFraming()

    expect(fit(framing, capRadius())).toEqual(fit(framing, NO_CAP))
  })

  it('falls back to the casters alone when the building by itself exceeds the cap', () => {
    const framing = scaledFraming(measuredReferenceFraming(), DOUBLED_FOOTPRINT)
    const capped = fit(framing, capRadius())

    expect(boundsRadius(framing.casters)).toBeGreaterThan(capRadius())
    expect(capped).toEqual(framing.casters)
    expect(numbersOf(capped).every(Number.isFinite)).toBe(true)
  })

  it('shrinks the shadow linearly to the cap radius, never the building, when only the shadow exceeds it', () => {
    const framing = scaledFraming(measuredReferenceFraming(), FOOTPRINT_BETWEEN_CAP_AND_UNCAPPED)
    const uncapped = fit(framing, NO_CAP)
    const capped = fit(framing, capRadius())

    expect(boundsRadius(framing.casters)).toBeLessThan(capRadius())
    expect(capRadius()).toBeLessThan(boundsRadius(uncapped))
    expect(boundsRadius(capped)).toBeCloseTo(capRadius(), 0)
    expect(contains(capped, framing.casters)).toBe(true)
    expect(contains(uncapped, capped)).toBe(true)
    expect(numbersOf(capped).every(Number.isFinite)).toBe(true)
  })

  it('keeps every floor of a six-floor house inside a finite fit no larger than it must be', () => {
    const floors = Array.from({ length: HOUSE_FLOOR_COUNT }, (_, index) => houseFloor(index))
    const framing = frame(houseProject(floors))
    const capped = fit(framing, capRadius())

    expect(numbersOf(capped).every(Number.isFinite)).toBe(true)
    expect(boundsRadius(capped)).toBeLessThanOrEqual(
      Math.max(capRadius(), boundsRadius(framing.casters)),
    )
    for (const floor of floors) {
      expect(contains(capped, frame(houseProject([floor])).casters), floor.name).toBe(true)
    }
  })
})
