import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type {
  FurnitureSceneNode,
  OpeningSceneNode,
  SceneGraph,
  StairSceneNode,
  StairRunType,
} from '../../core'
import { entityLabels } from './webgpu-scene-view'
import { SceneProxyOverlay } from './scene-proxy-overlay'

afterEach(cleanup)

// Three openings on one floor, in graph order: a door, then a window, then a
// second opening of that same door type. Minimal geometry fields are filled
// with fixed placeholder values, since only `id` and `type` drive labeling.
function opening(id: string, type: string): OpeningSceneNode {
  return {
    id,
    kind: 'opening',
    floorId: 'demo',
    type,
    center: { x: 0, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 900,
    height: 2032,
    sillHeight: 0,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

const DOOR_TYPE = 'single-swing-door'
const WINDOW_TYPE = 'double-hung-window'

const graph: SceneGraph = {
  nodes: [{ id: 'floor:demo', kind: 'floor', name: 'Demo', elevation: 0 }],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [
    opening('opening:door-a', DOOR_TYPE),
    opening('opening:window-a', WINDOW_TYPE),
    opening('opening:door-b', DOOR_TYPE),
  ],
  dimensions: [],
  stairs: [],
  furniture: [],
}

describe('opening labels in the 3D view', () => {
  it('numbers an opening within its own element-type sequence, humanized from its type id', () => {
    const labels = entityLabels(graph)
    const proxies = graph.openings.map((entity, index) => ({
      id: entity.id,
      x: index,
      y: index,
      label: labels.get(entity.id) ?? entity.id,
    }))

    render(<SceneProxyOverlay proxies={proxies} selectedIds={new Set()} onSelect={vi.fn()} />)

    // The first door and the window each start their own type sequence at 1,
    // and the second door continues its type's sequence at 2 rather than
    // sharing a single "Opening N" namespace with the window between them.
    expect(screen.getByRole('option', { name: 'Single Swing Door 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Double Hung Window 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Single Swing Door 2' })).toBeInTheDocument()
  })
})

// A single furniture piece, with minimal geometry filled with fixed placeholder
// values, since only `id` and `name` drive labeling.
function furniture(id: string, name?: string): FurnitureSceneNode {
  return {
    id,
    kind: 'furniture',
    floorId: 'demo',
    footprintCorners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    elevationZ: 0,
    height: 800,
    assetRef: { scope: 'project', contentHash: 'placeholder' },
    ...(name === undefined ? {} : { name }),
  }
}

const furnitureGraph: SceneGraph = {
  nodes: [{ id: 'floor:demo', kind: 'floor', name: 'Demo', elevation: 0 }],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [
    furniture('furniture:armchair', 'Wingback Armchair'),
    furniture('furniture:unnamed-a'),
    furniture('furniture:unnamed-b'),
  ],
}

describe('furniture labels in the 3D view', () => {
  it('labels a named piece by its name and falls back to its array position when unnamed', () => {
    const labels = entityLabels(furnitureGraph)
    const proxies = furnitureGraph.furniture.map((entity, index) => ({
      id: entity.id,
      x: index,
      y: index,
      label: labels.get(entity.id) ?? entity.id,
    }))

    render(<SceneProxyOverlay proxies={proxies} selectedIds={new Set()} onSelect={vi.fn()} />)

    // The two unnamed pieces number by array position (2, 3), not by a
    // separate count of only the unnamed pieces (which would give 1, 2).
    expect(screen.getByRole('option', { name: 'Wingback Armchair' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Furniture 2' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Furniture 3' })).toBeInTheDocument()
  })
})

// A single stair run, with minimal geometry filled with fixed placeholder
// values, since only `id` and `runType` drive labeling.
function stair(id: string, runType: StairRunType): StairSceneNode {
  return {
    id,
    kind: 'stair',
    floorId: 'demo',
    runType,
    position: { x: 0, y: 0 },
    width: 900,
    length: 3000,
    rotation: 0,
    wellFloorId: 'demo',
  }
}

const stairGraph: SceneGraph = {
  nodes: [{ id: 'floor:demo', kind: 'floor', name: 'Demo', elevation: 0 }],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [stair('stair:a', 'straight'), stair('stair:b', 'l-turn'), stair('stair:c', 'straight')],
  furniture: [],
}

describe('stair labels in the 3D view', () => {
  it('numbers a stair within its own run-type sequence, humanized from its run type id', () => {
    const labels = entityLabels(stairGraph)
    const proxies = stairGraph.stairs.map((entity, index) => ({
      id: entity.id,
      x: index,
      y: index,
      label: labels.get(entity.id) ?? entity.id,
    }))

    render(<SceneProxyOverlay proxies={proxies} selectedIds={new Set()} onSelect={vi.fn()} />)

    // The first straight run and the l-turn run each start their own type
    // sequence at 1, and the second straight run continues its type's
    // sequence at 2 rather than sharing a single "Stair N" namespace.
    expect(screen.getByRole('option', { name: 'Straight Stair 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'L Turn Stair 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Straight Stair 2' })).toBeInTheDocument()
  })
})
