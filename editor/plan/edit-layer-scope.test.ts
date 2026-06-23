import { describe, it, expect } from 'vitest'
import { scopeFurnitureToLayer, scopeSceneToLayer } from './edit-layer-scope'
import type {
  DimensionSceneNode,
  FurnitureInstance,
  FurnitureSceneNode,
  OpeningSceneNode,
  RoomSceneNode,
  SceneGraph,
  SceneNode,
  StairSceneNode,
  UnderlaySceneNode,
  WallSceneNode,
} from '../../core'

const WALL_THICKNESS_MM = 114
const OPENING_WIDTH_MM = 800
const OPENING_HEIGHT_MM = 2032
const ROOM_SPAN_MM = 4000
const FURNITURE_SPAN_MM = 600
const FURNITURE_HEIGHT_MM = 750

function wallNode(): WallSceneNode {
  return {
    id: 'wall:a',
    kind: 'wall',
    floorId: 'g',
    start: { x: 0, y: 0 },
    end: { x: ROOM_SPAN_MM, y: 0 },
    thickness: WALL_THICKNESS_MM,
  }
}

function roomNode(): RoomSceneNode {
  const polygon = [
    { x: 0, y: 0 },
    { x: ROOM_SPAN_MM, y: 0 },
    { x: ROOM_SPAN_MM, y: ROOM_SPAN_MM },
    { x: 0, y: ROOM_SPAN_MM },
  ]
  return { id: 'room:a', kind: 'room', floorId: 'g', polygon, area: 0, clearPolygon: polygon }
}

function openingNode(): OpeningSceneNode {
  return {
    id: 'opening:o1',
    kind: 'opening',
    floorId: 'g',
    type: 'single-swing-door',
    center: { x: 1000, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: OPENING_WIDTH_MM,
    height: OPENING_HEIGHT_MM,
    sillHeight: 0,
    hostThickness: WALL_THICKNESS_MM,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

function dimensionNode(): DimensionSceneNode {
  return {
    id: 'dimension:d1',
    kind: 'dimension',
    floorId: 'g',
    start: { x: 0, y: 0 },
    end: { x: ROOM_SPAN_MM, y: 0 },
    offset: 0,
    length: ROOM_SPAN_MM,
  }
}

function furnitureSceneNode(): FurnitureSceneNode {
  return {
    id: 'furniture:f1',
    kind: 'furniture',
    floorId: 'g',
    footprintCorners: [
      { x: 0, y: 0 },
      { x: FURNITURE_SPAN_MM, y: 0 },
      { x: FURNITURE_SPAN_MM, y: FURNITURE_SPAN_MM },
      { x: 0, y: FURNITURE_SPAN_MM },
    ],
    elevationZ: 0,
    height: FURNITURE_HEIGHT_MM,
    assetRef: { scope: 'project', contentHash: 'sha256-furniture' },
  }
}

function floorNode(): SceneNode {
  return { id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }
}

function underlayNode(): UnderlaySceneNode {
  return {
    id: 'underlay:u1',
    kind: 'underlay',
    floorId: 'g',
    source: { kind: 'raster', image: { scope: 'project', contentHash: 'sha256-underlay' } },
    width: ROOM_SPAN_MM,
    height: ROOM_SPAN_MM,
    placement: { offset: { x: 0, y: 0 }, millimetersPerPixel: 1, rotation: 0 },
    opacity: 1,
    visible: true,
  }
}

function stairNode(): StairSceneNode {
  return {
    id: 'stair:s1',
    kind: 'stair',
    floorId: 'g',
    runType: 'straight',
    position: { x: 0, y: 0 },
    width: FURNITURE_SPAN_MM,
    length: ROOM_SPAN_MM,
    rotation: 0,
    wellFloorId: 'upper',
  }
}

function fullScene(): SceneGraph {
  return {
    nodes: [floorNode()],
    walls: [wallNode()],
    rooms: [roomNode()],
    underlays: [underlayNode()],
    openings: [openingNode()],
    dimensions: [dimensionNode()],
    stairs: [stairNode()],
    furniture: [furnitureSceneNode()],
  }
}

describe('scopeSceneToLayer', () => {
  it('preserves every selectable collection for the "all" layer', () => {
    const scene = fullScene()

    const scoped = scopeSceneToLayer(scene, 'all')

    expect(scoped.walls).toEqual(scene.walls)
    expect(scoped.rooms).toEqual(scene.rooms)
    expect(scoped.openings).toEqual(scene.openings)
    expect(scoped.dimensions).toEqual(scene.dimensions)
    expect(scoped.furniture).toEqual(scene.furniture)
  })

  it('keeps walls and rooms but empties other selectable collections for the "walls" layer', () => {
    const scene = fullScene()

    const scoped = scopeSceneToLayer(scene, 'walls')

    expect(scoped.walls).toEqual(scene.walls)
    expect(scoped.rooms).toEqual(scene.rooms)
    expect(scoped.openings).toEqual([])
    expect(scoped.dimensions).toEqual([])
    expect(scoped.furniture).toEqual([])
  })

  it('keeps only openings for the "openings" layer', () => {
    const scene = fullScene()

    const scoped = scopeSceneToLayer(scene, 'openings')

    expect(scoped.openings).toEqual(scene.openings)
    expect(scoped.walls).toEqual([])
    expect(scoped.rooms).toEqual([])
    expect(scoped.dimensions).toEqual([])
    expect(scoped.furniture).toEqual([])
  })

  it('keeps only furniture for the "furniture" layer', () => {
    const scene = fullScene()

    const scoped = scopeSceneToLayer(scene, 'furniture')

    expect(scoped.furniture).toEqual(scene.furniture)
    expect(scoped.walls).toEqual([])
    expect(scoped.rooms).toEqual([])
    expect(scoped.openings).toEqual([])
    expect(scoped.dimensions).toEqual([])
  })

  it('keeps only dimensions for the "annotations" layer', () => {
    const scene = fullScene()

    const scoped = scopeSceneToLayer(scene, 'annotations')

    expect(scoped.dimensions).toEqual(scene.dimensions)
    expect(scoped.walls).toEqual([])
    expect(scoped.rooms).toEqual([])
    expect(scoped.openings).toEqual([])
    expect(scoped.furniture).toEqual([])
  })

  it.each(['all', 'walls', 'openings', 'furniture', 'annotations'] as const)(
    'leaves nodes, underlays, and stairs untouched for the "%s" layer',
    (layer) => {
      const scene = fullScene()

      const scoped = scopeSceneToLayer(scene, layer)

      expect(scoped.nodes).toEqual(scene.nodes)
      expect(scoped.underlays).toEqual(scene.underlays)
      expect(scoped.stairs).toEqual(scene.stairs)
    },
  )
})

describe('scopeFurnitureToLayer', () => {
  const furniture: readonly FurnitureInstance[] = [
    {
      id: 'f1',
      assetRef: { scope: 'project', contentHash: 'sha256-furniture' },
      position: { x: 0, y: 0 },
      rotation: 0,
      elevationZ: 0,
      footprint: { width: FURNITURE_SPAN_MM, depth: FURNITURE_SPAN_MM },
      height: FURNITURE_HEIGHT_MM,
    },
  ]

  it.each(['all', 'furniture'] as const)(
    'returns the furniture list unchanged for the "%s" layer',
    (layer) => {
      expect(scopeFurnitureToLayer(furniture, layer)).toEqual(furniture)
    },
  )

  it.each(['walls', 'openings', 'annotations'] as const)(
    'returns an empty list for the "%s" layer',
    (layer) => {
      expect(scopeFurnitureToLayer(furniture, layer)).toEqual([])
    },
  )
})
