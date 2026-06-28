import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import {
  DEFAULT_METRIC_PREFERENCES,
  type DimensionSceneNode,
  type OpeningSceneNode,
  type Point,
  type RoomSceneNode,
  type SceneGraph,
  type WallSceneNode,
} from '../../core'
import { createSelectionStore } from '../../bridge'
import { PlanOverlay, type PlanOverlayProps } from './plan-overlay'
import type { Viewport } from './viewport'

const FLOOR_ID = 'g'
const WALL_THICKNESS_MM = 114
const OPENING_WIDTH_MM = 900
const OPENING_HEIGHT_MM = 2040
const ROOM_AREA_MM2 = 1_200

const VIEWPORT: Viewport = { scale: 1, offset: { x: 0, y: 0 } }
const EMPTY_SELECTION: ReadonlySet<string> = new Set()

const ROOM_POLYGON: Point[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 30 },
  { x: 0, y: 30 },
]

function wall(): WallSceneNode {
  return {
    id: 'wall:w1',
    kind: 'wall',
    floorId: FLOOR_ID,
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    thickness: WALL_THICKNESS_MM,
  }
}

function room(): RoomSceneNode {
  return {
    id: 'room:r1',
    kind: 'room',
    floorId: FLOOR_ID,
    polygon: ROOM_POLYGON,
    clearPolygon: ROOM_POLYGON,
    area: ROOM_AREA_MM2,
  }
}

function opening(): OpeningSceneNode {
  return {
    id: 'opening:o1',
    kind: 'opening',
    floorId: FLOOR_ID,
    type: 'door.single',
    center: { x: 30, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: OPENING_WIDTH_MM,
    height: OPENING_HEIGHT_MM,
    sillHeight: 0,
    hostThickness: WALL_THICKNESS_MM,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

function dimension(): DimensionSceneNode {
  return {
    id: 'dimension:d1',
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

function renderOverlay(layer: PlanOverlayProps['layer']) {
  render(
    <PlanOverlay
      viewport={VIEWPORT}
      graph={graphWithOneOfEach()}
      selectedIds={EMPTY_SELECTION}
      selection={createSelectionStore()}
      preferences={DEFAULT_METRIC_PREFERENCES}
      snap={null}
      tool="select"
      layer={layer}
    />,
  )
}

afterEach(cleanup)

// The DOM accessibility overlay exposes one keyboard proxy (role="option") per
// selectable entity. The active edit layer must scope those proxies the same way
// it scopes pointer selection, so a keyboard user can only reach the entities the
// active layer leaves selectable.
describe('PlanOverlay edit-layer scoping', () => {
  it('exposes every entity proxy for the "all" layer', () => {
    renderOverlay('all')

    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('exposes only wall and room proxies for the "walls" layer', () => {
    renderOverlay('walls')

    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByRole('option', { name: /^Wall,/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Room,/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Dimension,/ })).not.toBeInTheDocument()
  })

  it('exposes only the opening proxy for the "openings" layer', () => {
    renderOverlay('openings')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.queryByRole('option', { name: /^Wall,/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Room,/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Dimension,/ })).not.toBeInTheDocument()
  })

  it('exposes only the dimension proxy for the "annotations" layer', () => {
    renderOverlay('annotations')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: /^Dimension,/ })).toBeInTheDocument()
  })
})
