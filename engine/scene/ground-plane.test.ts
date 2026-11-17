import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import { GROUND_SURFACE_HEX, type RoomSceneNode, type SceneGraph } from '../../core'
import { findByEntityId } from '../testing'

import { buildScene } from './build-scene'
import {
  addGroundPlane,
  groundExtent,
  isGroundPlane,
  GRADE_ELEVATION_MM,
  GROUND_PLANE_NAME,
} from './ground-plane'

const FOOTPRINT_WIDTH_MM = 4000
const FOOTPRINT_DEPTH_MM = 3000
const FOOTPRINT_HEIGHT_MM = 2400

// A non-zero grade the ground plane must honor, distinct from the 0 datum.
const SUPPLIED_GRADE_MM = 1500

// The site margin the ground plane extends past the footprint on each horizontal side.
const GROUND_MARGIN_MM = 5000

const BASEMENT_ELEVATION_MM = -2400
const FOUNDATION_WALL_HEIGHT_MM = 2700

// Box3 of an object in world space, with the whole hierarchy's matrices refreshed
// first so a mesh nested under an elevated floor group reports its true world Y.
const worldBox = (root: THREE.Object3D, object: THREE.Object3D): THREE.Box3 => {
  root.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(object)
}

describe('addGroundPlane', () => {
  it('adds a horizontal grass-colored ground plane at grade covering the footprint', () => {
    const root = new THREE.Group()
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(FOOTPRINT_WIDTH_MM, FOOTPRINT_HEIGHT_MM, FOOTPRINT_DEPTH_MM),
    )
    // Span x in [0, 4000], y in [0, 2400], z in [0, 3000].
    building.position.set(FOOTPRINT_WIDTH_MM / 2, FOOTPRINT_HEIGHT_MM / 2, FOOTPRINT_DEPTH_MM / 2)
    root.add(building)

    addGroundPlane(root)

    const ground = root.children.find(isGroundPlane)
    expect(ground).toBeDefined()
    if (!ground) return
    expect(ground.name).toBe(GROUND_PLANE_NAME)

    const box = worldBox(root, ground)
    // Flat at grade: the plane has no vertical extent and sits on the datum.
    expect(box.min.y).toBeCloseTo(GRADE_ELEVATION_MM)
    expect(box.max.y).toBeCloseTo(GRADE_ELEVATION_MM)
    // Covers the building footprint with a surrounding site margin.
    expect(box.min.x).toBeLessThan(0)
    expect(box.max.x).toBeGreaterThan(FOOTPRINT_WIDTH_MM)
    expect(box.min.z).toBeLessThan(0)
    expect(box.max.z).toBeGreaterThan(FOOTPRINT_DEPTH_MM)

    const material = (ground as THREE.Mesh).material as THREE.MeshStandardMaterial
    expect(material.color.g).toBeGreaterThan(material.color.r)
    expect(material.color.g).toBeGreaterThan(material.color.b)
  })

  it('paints the ground plane with the lawn color', () => {
    const root = new THREE.Group()

    addGroundPlane(root)

    const ground = root.children.find(isGroundPlane)
    expect(ground).toBeDefined()
    if (!ground) return
    const material = (ground as THREE.Mesh).material as THREE.MeshStandardMaterial
    expect(`#${material.color.getHexString()}`).toBe(GROUND_SURFACE_HEX)
  })

  it('seats the ground plane at the supplied grade elevation', () => {
    const root = new THREE.Group()

    addGroundPlane(root, SUPPLIED_GRADE_MM)

    const ground = root.children.find(isGroundPlane)
    expect(ground).toBeDefined()
    if (!ground) return
    const box = worldBox(root, ground)
    // The flat plane sits on the supplied grade, not the 0 datum.
    expect(box.min.y).toBeCloseTo(SUPPLIED_GRADE_MM)
    expect(box.max.y).toBeCloseTo(SUPPLIED_GRADE_MM)
  })
})

// A building that spans x in [0, 4000], y in [0, 2400], z in [0, 3000].
const footprintBuilding = (): THREE.Mesh => {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(FOOTPRINT_WIDTH_MM, FOOTPRINT_HEIGHT_MM, FOOTPRINT_DEPTH_MM),
  )
  building.position.set(FOOTPRINT_WIDTH_MM / 2, FOOTPRINT_HEIGHT_MM / 2, FOOTPRINT_DEPTH_MM / 2)
  return building
}

describe('groundExtent', () => {
  it('reports the footprint plus the site margin on each side, flat at the supplied grade', () => {
    const root = new THREE.Group()
    root.add(footprintBuilding())
    addGroundPlane(root, SUPPLIED_GRADE_MM)

    const extent = groundExtent(root)

    expect(extent).toEqual({
      min: { x: -GROUND_MARGIN_MM, y: SUPPLIED_GRADE_MM, z: -GROUND_MARGIN_MM },
      max: {
        x: FOOTPRINT_WIDTH_MM + GROUND_MARGIN_MM,
        y: SUPPLIED_GRADE_MM,
        z: FOOTPRINT_DEPTH_MM + GROUND_MARGIN_MM,
      },
    })
  })

  it('finds a ground plane nested under a parent object, in world coordinates', () => {
    const root = new THREE.Group()
    const parent = new THREE.Group()
    parent.add(footprintBuilding())
    addGroundPlane(parent)
    root.add(parent)
    const shiftX = 1000
    const shiftZ = 2000
    parent.position.set(shiftX, 0, shiftZ)

    const extent = groundExtent(root)

    expect(extent).toEqual({
      min: { x: shiftX - GROUND_MARGIN_MM, y: GRADE_ELEVATION_MM, z: shiftZ - GROUND_MARGIN_MM },
      max: {
        x: shiftX + FOOTPRINT_WIDTH_MM + GROUND_MARGIN_MM,
        y: GRADE_ELEVATION_MM,
        z: shiftZ + FOOTPRINT_DEPTH_MM + GROUND_MARGIN_MM,
      },
    })
  })

  it('returns null when the root holds no ground plane', () => {
    const root = new THREE.Group()
    root.add(footprintBuilding())

    expect(groundExtent(root)).toBeNull()
  })
})

describe('buildScene ground plane', () => {
  it('seats the unified model on a ground plane with the basement foundation rising above grade', () => {
    const graph: SceneGraph = {
      nodes: [
        { id: 'floor:ground', kind: 'floor', name: 'Ground', elevation: 0 },
        { id: 'floor:basement', kind: 'floor', name: 'Basement', elevation: BASEMENT_ELEVATION_MM },
      ],
      walls: [
        {
          id: 'wall:above',
          kind: 'wall',
          floorId: 'ground',
          start: { x: 0, y: 0 },
          end: { x: FOOTPRINT_WIDTH_MM, y: 0 },
          thickness: 200,
          height: FOUNDATION_WALL_HEIGHT_MM,
        },
        {
          id: 'wall:foundation',
          kind: 'wall',
          floorId: 'basement',
          start: { x: 0, y: 0 },
          end: { x: FOOTPRINT_WIDTH_MM, y: 0 },
          thickness: 300,
          height: FOUNDATION_WALL_HEIGHT_MM,
        },
      ],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }

    const root = buildScene(graph)

    const ground = root.children.find(isGroundPlane)
    expect(ground).toBeDefined()
    if (!ground) return
    expect(worldBox(root, ground).max.y).toBeCloseTo(GRADE_ELEVATION_MM)

    const foundation = findByEntityId(root, 'wall:foundation')
    expect(foundation).not.toBeNull()
    if (!foundation) return
    const foundationBox = worldBox(root, foundation)
    // The basement finished floor is below grade, but the foundation wall rises
    // through the ground surface, so its above-grade portion shows above the lawn.
    expect(foundationBox.min.y).toBeLessThan(GRADE_ELEVATION_MM)
    expect(foundationBox.max.y).toBeGreaterThan(GRADE_ELEVATION_MM)
  })
})

const SLAB_TOP_ROLE = 'top'

// A single rectangular room seated on the ground floor: the built tree then
// holds both a room slab (whose top cap material is named `top`) and the ground
// plane, the two coincident at-grade surfaces this bias resolves.
const roomOnGroundGraph = (): SceneGraph => {
  const rectangle = [
    { x: 0, y: 0 },
    { x: FOOTPRINT_WIDTH_MM, y: 0 },
    { x: FOOTPRINT_WIDTH_MM, y: FOOTPRINT_DEPTH_MM },
    { x: 0, y: FOOTPRINT_DEPTH_MM },
  ]
  const room: RoomSceneNode = {
    id: 'room:r1',
    kind: 'room',
    floorId: 'ground',
    polygon: rectangle,
    clearPolygon: rectangle,
    area: FOOTPRINT_WIDTH_MM * FOOTPRINT_DEPTH_MM,
  }
  return {
    nodes: [{ id: 'floor:ground', kind: 'floor', name: 'Ground', elevation: 0 }],
    walls: [],
    rooms: [room],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

// The floor slab is the only surface carrying an upward `top` cap; that cap's
// entry is the finished-floor material whose backward depth bias the ground
// plane must exceed.
const slabTopMaterial = (root: THREE.Object3D): THREE.MeshStandardMaterial | undefined => {
  let found: THREE.MeshStandardMaterial | undefined
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !Array.isArray(object.material)) return
    const materials = object.material as THREE.Material[]
    const top = materials.find((material) => material.name === SLAB_TOP_ROLE)
    if (top) found = top as THREE.MeshStandardMaterial
  })
  return found
}

describe('buildScene ground plane depth bias', () => {
  it('biases the ground plane farther back than the coincident floor slab top so the finished floor wins', () => {
    const root = buildScene(roomOnGroundGraph())

    const ground = root.children.find(isGroundPlane)
    expect(ground).toBeDefined()
    if (!ground) return
    const groundMaterial = (ground as THREE.Mesh).material as THREE.MeshStandardMaterial

    const slabTop = slabTopMaterial(root)
    expect(slabTop).toBeDefined()
    if (!slabTop) return

    // A larger positive polygon offset pushes the ground plane farther back in
    // depth than the slab top, so the lawn loses the contest and the finished
    // floor draws over it where the two coplanar surfaces overlap.
    expect(groundMaterial.polygonOffset).toBe(true)
    expect(groundMaterial.polygonOffsetFactor).toBeGreaterThan(slabTop.polygonOffsetFactor)
    expect(groundMaterial.polygonOffsetUnits).toBeGreaterThan(slabTop.polygonOffsetUnits)
  })
})

const WATCHED_PROPERTIES = ['children', 'userData'] as const

// Replaces `children` and `userData` on each object with getters that record the
// read as `<name>.<property>` and return the original value. A search must read
// one of the two to look at an object or to go below it, so the recorded list is
// the set of objects the search examined. Install it after the scene is built.
const watchExamination = (objects: readonly THREE.Object3D[]): (() => string[]) => {
  const reads: string[] = []
  for (const object of objects) {
    for (const property of WATCHED_PROPERTIES) {
      let value: unknown = object[property]
      Object.defineProperty(object, property, {
        configurable: true,
        get: () => {
          reads.push(`${object.name}.${property}`)
          return value
        },
        set: (next: unknown) => {
          value = next
        },
      })
    }
  }
  return () => [...reads]
}

const namedGroup = (name: string): THREE.Group => {
  const group = new THREE.Group()
  group.name = name
  return group
}

const GROUND_BOX = {
  min: { x: -GROUND_MARGIN_MM, y: GRADE_ELEVATION_MM, z: -GROUND_MARGIN_MM },
  max: { x: GROUND_MARGIN_MM, y: GRADE_ELEVATION_MM, z: GROUND_MARGIN_MM },
}

describe('groundExtent search', () => {
  it('lets the watch record a read of the children of a watched object', () => {
    const watched = namedGroup('watched')
    const untouched = namedGroup('untouched')
    const examined = watchExamination([watched, untouched])

    expect(watched.children).toHaveLength(0)

    expect(examined()).toEqual(['watched.children'])
  })

  it('stops at a ground plane near the root without examining the objects added after it', () => {
    const root = namedGroup('root')
    addGroundPlane(root)
    const groups = ['after-1', 'after-2', 'after-3'].map(namedGroup)
    for (const group of groups) {
      group.add(footprintBuilding())
      root.add(group)
    }
    const examined = watchExamination(groups)

    const extent = groundExtent(root)

    expect(extent).toEqual(GROUND_BOX)
    expect(examined()).toEqual([])
  })

  it('looks at a whole level before it goes below any object on that level', () => {
    const scene = namedGroup('scene')
    const frame = namedGroup('frame')
    const floorA = namedGroup('floor-a')
    const floorB = namedGroup('floor-b')
    const nested = namedGroup('nested')
    const buildingA = footprintBuilding()
    buildingA.name = 'building-a'
    const buildingB = footprintBuilding()
    buildingB.name = 'building-b'
    floorA.add(buildingA)
    nested.add(buildingB)
    floorB.add(nested)
    frame.add(floorA, floorB)
    scene.add(frame)
    addGroundPlane(frame)
    const examined = watchExamination([buildingA, nested, buildingB])

    const extent = groundExtent(scene)

    expect(extent).toEqual({
      min: { x: -GROUND_MARGIN_MM, y: GRADE_ELEVATION_MM, z: -GROUND_MARGIN_MM },
      max: {
        x: FOOTPRINT_WIDTH_MM + GROUND_MARGIN_MM,
        y: GRADE_ELEVATION_MM,
        z: FOOTPRINT_DEPTH_MM + GROUND_MARGIN_MM,
      },
    })
    expect(examined()).toEqual([])
  })

  it('reports the first of two ground planes at the same depth', () => {
    const root = namedGroup('root')
    addGroundPlane(root)
    addGroundPlane(root, SUPPLIED_GRADE_MM)

    expect(groundExtent(root)).toEqual(GROUND_BOX)
  })
})
