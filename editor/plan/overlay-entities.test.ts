import { describe, expect, it } from 'vitest'
import {
  DEFAULT_METRIC_PREFERENCES,
  type DimensionSceneNode,
  type OpeningSceneNode,
  type Point,
  type RoomSceneNode,
  type SceneGraph,
  type WallSceneNode,
} from '../../core'
import { entityAnchor } from './overlay-anchor'
import { ariaLabel } from './overlay-label'
import { overlayEntities } from './overlay-entities'

const FLOOR_ID = 'g'
const WALL_ID = 'wall:w1'
const ROOM_ID = 'room:r1'
const OPENING_ID = 'opening:o1'
const DIMENSION_ID = 'dimension:d1'

const WALL_THICKNESS_MM = 114
const OPENING_WIDTH_MM = 900
const OPENING_HEIGHT_MM = 2040
const SILL_HEIGHT_MM = 0
const ROOM_AREA_MM2 = 1_200

const ROOM_POLYGON: Point[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 30 },
  { x: 0, y: 30 },
]

function wall(): WallSceneNode {
  return {
    id: WALL_ID,
    kind: 'wall',
    floorId: FLOOR_ID,
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    thickness: WALL_THICKNESS_MM,
  }
}

function room(): RoomSceneNode {
  return {
    id: ROOM_ID,
    kind: 'room',
    floorId: FLOOR_ID,
    polygon: ROOM_POLYGON,
    clearPolygon: ROOM_POLYGON,
    area: ROOM_AREA_MM2,
  }
}

function opening(): OpeningSceneNode {
  return {
    id: OPENING_ID,
    kind: 'opening',
    floorId: FLOOR_ID,
    type: 'door.single',
    center: { x: 30, y: 40 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: OPENING_WIDTH_MM,
    height: OPENING_HEIGHT_MM,
    sillHeight: SILL_HEIGHT_MM,
    hostThickness: WALL_THICKNESS_MM,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

function dimension(): DimensionSceneNode {
  return {
    id: DIMENSION_ID,
    kind: 'dimension',
    floorId: FLOOR_ID,
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    offset: 10,
    length: 100,
  }
}

function graphWithOneOfEach(): SceneGraph {
  return {
    nodes: [],
    walls: [wall()],
    rooms: [room()],
    underlays: [],
    openings: [opening()],
    dimensions: [dimension()],
    stairs: [],
    furniture: [],
  }
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set()

describe('overlayEntities', () => {
  it('emits one entity per node ordered walls, rooms, openings, then dimensions', () => {
    const result = overlayEntities(
      graphWithOneOfEach(),
      EMPTY_SELECTION,
      DEFAULT_METRIC_PREFERENCES,
    )

    expect(result.map((entity) => entity.id)).toEqual([WALL_ID, ROOM_ID, OPENING_ID, DIMENSION_ID])
    expect(result.map((entity) => entity.kind)).toEqual(['wall', 'room', 'opening', 'dimension'])
  })

  it('labels and anchors each entity via the shared helpers', () => {
    const nodes = [wall(), room(), opening(), dimension()]
    const result = overlayEntities(
      graphWithOneOfEach(),
      EMPTY_SELECTION,
      DEFAULT_METRIC_PREFERENCES,
    )

    expect(result.map((entity) => entity.label)).toEqual(
      nodes.map((node) => ariaLabel(node, DEFAULT_METRIC_PREFERENCES)),
    )
    expect(result.map((entity) => entity.anchor)).toEqual(nodes.map((node) => entityAnchor(node)))
  })

  it('marks only the entities whose ids are in the selection set', () => {
    const selected: ReadonlySet<string> = new Set([OPENING_ID])

    const result = overlayEntities(graphWithOneOfEach(), selected, DEFAULT_METRIC_PREFERENCES)

    const selectedIds = result.filter((entity) => entity.selected).map((entity) => entity.id)
    expect(selectedIds).toEqual([OPENING_ID])
  })

  it('returns no entities for a graph with no selectable nodes', () => {
    const empty: SceneGraph = {
      nodes: [],
      walls: [],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }

    expect(overlayEntities(empty, EMPTY_SELECTION, DEFAULT_METRIC_PREFERENCES)).toEqual([])
  })
})
