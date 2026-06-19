import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { buildScene } from './build-scene'
import {
  cameraFacesWallOutside,
  prepareNearWallTransparency,
  updateNearWallTransparency,
  type NearWallTarget,
} from './near-wall-transparency'
import { findByEntityId } from '../testing'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { buildWallGraph, exteriorWalls, junctionFadeGroups, type SceneGraph } from '../../core'

const ROOM_SIDE_MM = 4000
const WALL_THICKNESS_MM = 200
const WALL_HEIGHT_MM = 2400

const FADED_OPACITY = 0.1
const OPAQUE = 1
const GLASS_OPACITY = 0.3

/** The four corners of the square room's clear polygon, counter-clockwise. */
const roomSquare = [
  { x: 0, y: 0 },
  { x: ROOM_SIDE_MM, y: 0 },
  { x: ROOM_SIDE_MM, y: ROOM_SIDE_MM },
  { x: 0, y: ROOM_SIDE_MM },
]

/** One 200-thick wall along an edge of the square room, on the ground floor. */
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

/** A single rectangular room ringed by four exterior walls, all on one floor. */
const rectangularRoomGraph = (): SceneGraph => ({
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
  walls: [
    wall('wall:bottom', { x: 0, y: 0 }, { x: ROOM_SIDE_MM, y: 0 }),
    wall('wall:right', { x: ROOM_SIDE_MM, y: 0 }, { x: ROOM_SIDE_MM, y: ROOM_SIDE_MM }),
    wall('wall:top', { x: ROOM_SIDE_MM, y: ROOM_SIDE_MM }, { x: 0, y: ROOM_SIDE_MM }),
    wall('wall:left', { x: 0, y: ROOM_SIDE_MM }, { x: 0, y: 0 }),
  ],
  rooms: [
    {
      id: 'room:r1',
      kind: 'room',
      floorId: 'g',
      polygon: roomSquare,
      clearPolygon: roomSquare,
      area: ROOM_SIDE_MM * ROOM_SIDE_MM,
      ceilingHeight: WALL_HEIGHT_MM,
    },
  ],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
})

/** The material array of the wall mesh carrying `entityId` under `root`. */
const wallMaterials = (root: THREE.Group, entityId: string): THREE.Material[] => {
  const mesh = findByEntityId(root, entityId)
  expect(mesh).toBeInstanceOf(THREE.Mesh)
  return (mesh as THREE.Mesh).material as THREE.Material[]
}

const door = (): SceneGraph['openings'][number] => ({
  id: 'opening:door',
  kind: 'opening',
  floorId: 'g',
  type: 'single-swing-door',
  center: { x: 2000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: 900,
  height: 2032,
  sillHeight: 0,
  hostThickness: WALL_THICKNESS_MM,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'bottom',
})

const windowOpening = (): SceneGraph['openings'][number] => ({
  id: 'opening:window',
  kind: 'opening',
  floorId: 'g',
  type: 'double-hung-window',
  center: { x: 2000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: 900,
  height: 1200,
  sillHeight: 900,
  hostThickness: WALL_THICKNESS_MM,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'bottom',
})

/** The single-material mesh under the opening group whose material has `name`. */
const openingMesh = (root: THREE.Group, entityId: string, name: string): THREE.Mesh => {
  const group = findByEntityId(root, entityId)
  expect(group).not.toBeNull()
  let found: THREE.Mesh | undefined
  ;(group as THREE.Object3D).traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      !Array.isArray(object.material) &&
      object.material.name === name
    ) {
      found = object
    }
  })
  expect(found).toBeDefined()
  return found as THREE.Mesh
}

const BAR_LENGTH_MM = 2000
const LEG_LENGTH_MM = 1000
const BAR_MIDPOINT_MM = BAR_LENGTH_MM / 2

/** A bar wall and the leg partition teed up from its midpoint, both on the ground floor. */
const tJunctionWalls = (): SceneGraph['walls'] => [
  wall('wall:bar', { x: 0, y: 0 }, { x: BAR_LENGTH_MM, y: 0 }),
  wall('wall:leg', { x: BAR_MIDPOINT_MM, y: 0 }, { x: BAR_MIDPOINT_MM, y: LEG_LENGTH_MM }),
]

/**
 * Two rooms north of an exterior "bar" wall, divided by an interior "leg" partition
 * that tees up from the bar's midpoint. `buildWallGraph` splits the bar at the tee
 * foot, so the vertex at the midpoint carries three incident edges: a 3+-way junction
 * whose fill `buildScene` draws and tags with a `userData.junctionKey`. The bar is
 * exterior (open air to the south); the leg bounds two interior rooms and never fades.
 */
const tJunctionGraph = (): SceneGraph => {
  const roomA = [
    { x: 0, y: 0 },
    { x: BAR_MIDPOINT_MM, y: 0 },
    { x: BAR_MIDPOINT_MM, y: LEG_LENGTH_MM },
    { x: 0, y: LEG_LENGTH_MM },
  ]
  const roomB = [
    { x: BAR_MIDPOINT_MM, y: 0 },
    { x: BAR_LENGTH_MM, y: 0 },
    { x: BAR_LENGTH_MM, y: LEG_LENGTH_MM },
    { x: BAR_MIDPOINT_MM, y: LEG_LENGTH_MM },
  ]
  return {
    nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
    walls: tJunctionWalls(),
    rooms: [
      {
        id: 'room:a',
        kind: 'room',
        floorId: 'g',
        polygon: roomA,
        clearPolygon: roomA,
        area: BAR_MIDPOINT_MM * LEG_LENGTH_MM,
        ceilingHeight: WALL_HEIGHT_MM,
      },
      {
        id: 'room:b',
        kind: 'room',
        floorId: 'g',
        polygon: roomB,
        clearPolygon: roomB,
        area: BAR_MIDPOINT_MM * LEG_LENGTH_MM,
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

/** The single tagged junction-fill mesh under `root` (the one carrying a `junctionKey`). */
const junctionFillMesh = (root: THREE.Group): THREE.Mesh => {
  let found: THREE.Mesh | undefined
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      typeof object.userData.junctionKey === 'string' &&
      found === undefined
    ) {
      found = object
    }
  })
  expect(found).toBeDefined()
  return found as THREE.Mesh
}

describe('cameraFacesWallOutside', () => {
  it('is true on the outward-normal side of the wall point and false on the other', () => {
    const point = { x: 0, z: 0 }
    const outwardNormal = { x: 0, z: -1 }

    expect(cameraFacesWallOutside({ x: 0, z: -100 }, point, outwardNormal)).toBe(true)
    expect(cameraFacesWallOutside({ x: 0, z: 100 }, point, outwardNormal)).toBe(false)
  })
})

describe('prepareNearWallTransparency', () => {
  it('clones each exterior wall mesh material array into private instances', () => {
    const graph = rectangularRoomGraph()
    const materials = new NeutralMaterialProvider()
    const sharedInteriorFace = materials.material('interiorFace')

    const root = buildScene(graph, materials)
    prepareNearWallTransparency(root, exteriorWalls(graph.walls, graph.rooms))

    const bottomMaterials = wallMaterials(root, 'wall:bottom')
    const topMaterials = wallMaterials(root, 'wall:top')

    // Cloned, not the provider's shared role instance.
    for (const material of bottomMaterials) {
      expect(material).not.toBe(sharedInteriorFace)
    }
    // Each wall owns its own instances: no material is shared between two walls.
    for (const bottom of bottomMaterials) {
      expect(topMaterials).not.toContain(bottom)
    }
  })

  it('enrolls the junction fill as a privatized, hold-opaque member of its fade group', () => {
    const graph = tJunctionGraph()
    const materials = new NeutralMaterialProvider()
    const sharedJunctionFace = materials.material('junction')

    const root = buildScene(graph, materials)

    // The tagged fill mesh draws its sides with the SHARED `junction` role material
    // before any privatization. Holding this shared instance opaque would pin every
    // junction's material opaque, so the prep must clone it first.
    const fill = junctionFillMesh(root)
    const fillSourceMaterials = fill.material as THREE.Material[]
    expect(fillSourceMaterials).toContain(sharedJunctionFace)

    const fadeGroups = junctionFadeGroups(buildWallGraph(graph.walls), graph.walls, graph.rooms)
    const targets = prepareNearWallTransparency(
      root,
      exteriorWalls(graph.walls, graph.rooms),
      fadeGroups,
    )

    // Across every prepared target, the records flagged to hold at baseline (the fill's
    // side faces) must not animate to the faded opacity. At least one such record exists.
    const holdOpaqueRecords = targets
      .flatMap((target) => target.materials)
      .filter((record) => (record as { holdOpaque?: boolean }).holdOpaque === true)
    expect(holdOpaqueRecords.length).toBeGreaterThan(0)

    // Privatization: the hold-opaque records own cloned materials, never the provider's
    // shared `junction` instance, so holding the fill opaque cannot pin unrelated geometry.
    for (const record of holdOpaqueRecords) {
      expect(record.material).not.toBe(sharedJunctionFace)
    }

    // The fill's own materials were privatized in place: the mesh no longer references
    // the shared instance, and a hold-opaque record points at one of its private clones.
    const privatizedFillMaterials = fill.material as THREE.Material[]
    expect(privatizedFillMaterials).not.toContain(sharedJunctionFace)
    expect(
      holdOpaqueRecords.some((record) => privatizedFillMaterials.includes(record.material)),
    ).toBe(true)
  })
})

describe('updateNearWallTransparency', () => {
  it('fades the wall whose outside faces the camera and leaves the opposite wall opaque', () => {
    const graph = rectangularRoomGraph()
    const root = buildScene(graph, new NeutralMaterialProvider())
    const targets = prepareNearWallTransparency(root, exteriorWalls(graph.walls, graph.rooms))

    // Camera well to the negative-Z side: outside the bottom wall (world z=0,
    // outward normal world (0,0,-1)), inside the top wall (world z=4000,
    // outward normal world (0,0,+1)).
    updateNearWallTransparency(targets, { x: 2000, z: -3000 })

    for (const material of wallMaterials(root, 'wall:bottom')) {
      expect(material.transparent).toBe(true)
      expect(material.opacity).toBe(FADED_OPACITY)
      expect(material.depthWrite).toBe(false)
    }
    for (const material of wallMaterials(root, 'wall:top')) {
      expect(material.opacity).toBe(OPAQUE)
    }
  })

  it('fades a hosted opening with its wall and keeps the opening mesh material single', () => {
    const graph = rectangularRoomGraph()
    graph.openings = [door()]
    const root = buildScene(graph, new NeutralMaterialProvider())
    const targets = prepareNearWallTransparency(
      root,
      exteriorWalls(graph.walls, graph.rooms, graph.openings),
    )

    // Camera outside the bottom wall (world z=0, outward normal world (0,0,-1)).
    updateNearWallTransparency(targets, { x: 2000, z: -3000 })

    const leaf = openingMesh(root, 'opening:door', 'leaf')
    expect(Array.isArray(leaf.material)).toBe(false)
    expect((leaf.material as THREE.Material).opacity).toBe(FADED_OPACITY)
  })

  it('restores a window glass pane to translucent after its wall fades and returns', () => {
    const graph = rectangularRoomGraph()
    graph.openings = [windowOpening()]
    const root = buildScene(graph, new NeutralMaterialProvider())
    const targets = prepareNearWallTransparency(
      root,
      exteriorWalls(graph.walls, graph.rooms, graph.openings),
    )
    const glass = openingMesh(root, 'opening:window', 'glass').material as THREE.Material

    updateNearWallTransparency(targets, { x: 2000, z: -3000 }) // outside: fade
    expect(glass.opacity).toBe(FADED_OPACITY)

    updateNearWallTransparency(targets, { x: 2000, z: 3000 }) // inside: restore
    expect(glass.opacity).toBe(GLASS_OPACITY)
    expect(glass.transparent).toBe(true)
    expect(glass.depthWrite).toBe(false)
  })

  it('holds a hold-opaque fill material at its solid baseline while its target fades the bar wall', () => {
    const graph = tJunctionGraph()
    const root = buildScene(graph, new NeutralMaterialProvider())

    // The same prefixed scene-node ids the live framed-scene path supplies, so the
    // prefix-robust selector join enrolls the tagged fill as a hold-opaque member.
    const fadeGroups = junctionFadeGroups(buildWallGraph(graph.walls), graph.walls, graph.rooms)
    const prepared = prepareNearWallTransparency(
      root,
      exteriorWalls(graph.walls, graph.rooms),
      fadeGroups,
    )

    const fillRecords = prepared
      .flatMap((target) => target.materials)
      .filter((record) => record.holdOpaque === true)
    expect(fillRecords.length).toBeGreaterThan(0)

    // The bar runs along world z=0 with its outward normal to negative Z (open air to the
    // south), so a camera on the negative-Z side sees it from outside and its target fades.
    // Carry the fill's hold-opaque records on that SAME fading target so that honoring
    // `holdOpaque` per material is the only thing that can keep the fill solid. (The fill
    // covers the leg's mitered end and divides the rooms; it must not fade with the bar.)
    const barTarget = prepared.find((target) => target.outwardNormal.z < 0)
    expect(barTarget).toBeDefined()
    const fadingTarget: NearWallTarget = {
      point: (barTarget as NearWallTarget).point,
      outwardNormal: (barTarget as NearWallTarget).outwardNormal,
      materials: [...(barTarget as NearWallTarget).materials, ...fillRecords],
    }

    const fillBaselines = fillRecords.map((record) => ({ ...record.baseline }))

    updateNearWallTransparency([fadingTarget], { x: BAR_MIDPOINT_MM, z: -3000 })

    // The bar wall fades as before.
    for (const material of wallMaterials(root, 'wall:bar')) {
      expect(material.transparent).toBe(true)
      expect(material.opacity).toBe(FADED_OPACITY)
      expect(material.depthWrite).toBe(false)
    }

    // The fill must NOT fade with the bar: every hold-opaque material stays at its recorded
    // solid baseline, never dropping to the fade opacity.
    fillRecords.forEach((record, index) => {
      const baseline = fillBaselines[index]
      expect(record.material.opacity).toBe(baseline.opacity)
      expect(record.material.transparent).toBe(baseline.transparent)
      expect(record.material.depthWrite).toBe(baseline.depthWrite)
      expect(record.material.opacity).not.toBe(FADED_OPACITY)
    })
  })
})
