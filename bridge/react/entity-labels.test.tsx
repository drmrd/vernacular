import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { OpeningSceneNode, SceneGraph } from '../../core'
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
