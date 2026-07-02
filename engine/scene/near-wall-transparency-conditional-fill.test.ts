import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { buildScene } from './build-scene'
import {
  prepareNearWallTransparency,
  updateNearWallTransparency,
  type NearWallTarget,
} from './near-wall-transparency'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { buildWallGraph, exteriorWalls, junctionFadeGroups, type SceneGraph } from '../../core'

const FADED_OPACITY = 0.1
const OPAQUE = 1
const WALL_THICKNESS_MM = 200
const WALL_HEIGHT_MM = 2400

/** A single 200-thick wall on the ground floor, mirroring the sibling suite's `wall` helper. */
const wall = (
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): SceneGraph['walls'][number] => ({
  id,
  kind: 'wall',
  floorId: 'g',
  start,
  end,
  thickness: WALL_THICKNESS_MM,
  height: WALL_HEIGHT_MM,
})

/**
 * A conditional-hold fill target hand-built with two incident facings: one "outside" when the
 * camera sits at z > 0, the other "outside" when the camera sits at x > 0. The single fade
 * record carries a solid baseline and NO `holdOpaque`, so only the incident-facing rule can
 * decide whether it fades.
 */
const makeConditionalFillTarget = (): NearWallTarget => {
  const material = new THREE.MeshStandardMaterial()
  const record = {
    material,
    baseline: { transparent: false, opacity: 1, depthWrite: true },
  }
  return {
    materials: [record],
    point: { x: 0, z: 0 },
    outwardNormal: { x: 0, z: 0 },
    incidentFacings: [
      { point: { x: 0, z: 0 }, outwardNormal: { x: 0, z: 1 } },
      { point: { x: 0, z: 0 }, outwardNormal: { x: 1, z: 0 } },
    ],
  }
}

/**
 * Two rooms that meet only at the corner (1000,0). The west, east, and north walls each have
 * open air on one side, so all three classify as exterior and the corner is a pure-exterior
 * 3-way junction: `buildScene` tags one junction-fill mesh there whose fade group holds
 * conditionally rather than unconditionally.
 */
const pureExteriorJunctionGraph = (): SceneGraph => {
  const roomA = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ]
  const roomB = [
    { x: 1000, y: 0 },
    { x: 2000, y: 0 },
    { x: 2000, y: -1000 },
    { x: 1000, y: -1000 },
  ]
  return {
    nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
    walls: [
      wall('wall:west', { x: 0, y: 0 }, { x: 1000, y: 0 }),
      wall('wall:east', { x: 1000, y: 0 }, { x: 2000, y: 0 }),
      wall('wall:north', { x: 1000, y: 0 }, { x: 1000, y: 1000 }),
    ],
    rooms: [
      {
        id: 'room:a',
        kind: 'room',
        floorId: 'g',
        polygon: roomA,
        clearPolygon: roomA,
        area: 1000 * 1000,
        ceilingHeight: WALL_HEIGHT_MM,
      },
      {
        id: 'room:b',
        kind: 'room',
        floorId: 'g',
        polygon: roomB,
        clearPolygon: roomB,
        area: 1000 * 1000,
        ceilingHeight: WALL_HEIGHT_MM,
      },
    ],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

describe('updateNearWallTransparency conditional junction fill (ADR-0140)', () => {
  it('fades a conditional fill only when the camera is outside every incident wall', () => {
    // Camera outside BOTH facings (x > 0 and z > 0): every incident wall fades, so the fill fades.
    const outsideEvery = makeConditionalFillTarget()
    updateNearWallTransparency([outsideEvery], { x: 1000, z: 1000 })

    const fadedRecord = outsideEvery.materials[0]
    if (!fadedRecord) throw new Error('conditional fill target lost its fade record')
    const fadedMaterial = fadedRecord.material
    expect(fadedMaterial.opacity).toBe(FADED_OPACITY)
    expect(fadedMaterial.transparent).toBe(true)
    expect(fadedMaterial.depthWrite).toBe(false)

    // Camera outside only the second facing (x > 0) but INSIDE the first (z < 0): not every
    // incident wall has faded, so the fill must stay solid at its baseline.
    const outsideOne = makeConditionalFillTarget()
    updateNearWallTransparency([outsideOne], { x: 1000, z: -1000 })

    const solidRecord = outsideOne.materials[0]
    if (!solidRecord) throw new Error('conditional fill target lost its fade record')
    const solidMaterial = solidRecord.material
    expect(solidMaterial.opacity).toBe(OPAQUE)
    expect(solidMaterial.transparent).toBe(false)
    expect(solidMaterial.depthWrite).toBe(true)
    expect(solidMaterial.opacity).not.toBe(FADED_OPACITY)
  })
})

describe('prepareNearWallTransparency conditional junction fill (ADR-0140)', () => {
  it('enrolls a pure-exterior junction fill as a conditional member carrying its incident wall facings', () => {
    const graph = pureExteriorJunctionGraph()
    const materials = new NeutralMaterialProvider()
    const sharedJunctionFace = materials.material('junction')

    const root = buildScene(graph, materials)

    const fadeGroups = junctionFadeGroups(buildWallGraph(graph.walls), graph.walls, graph.rooms)
    const targets = prepareNearWallTransparency(
      root,
      exteriorWalls(graph.walls, graph.rooms),
      fadeGroups,
    )

    // Exactly one prepared target is the conditional fill, marked by a non-empty incident-facing
    // list. Ordinary wall targets and unconditional-hold fills carry none.
    const conditionalTargets = targets.filter((target) => (target.incidentFacings?.length ?? 0) > 0)
    expect(conditionalTargets).toHaveLength(1)

    // One facing per incident exterior wall (west, east, north).
    const fillTarget = conditionalTargets[0]
    if (!fillTarget) throw new Error('conditional fill target was not enrolled')
    expect(fillTarget.incidentFacings).toHaveLength(3)

    // A pure-exterior fill fades conditionally, so none of its records holds opaque.
    for (const record of fillTarget.materials) {
      expect(record.holdOpaque).not.toBe(true)
    }

    // The fill's materials were privatized: none is the provider's shared `junction` instance,
    // so fading this fill never pins unrelated junction geometry.
    for (const record of fillTarget.materials) {
      expect(record.material).not.toBe(sharedJunctionFace)
    }
  })
})
