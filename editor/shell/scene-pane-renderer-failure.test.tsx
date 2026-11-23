import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { SceneGraph } from '../../core'
import { SceneFailureHost } from '../../bridge/react/scene-failure-host'
import { ScenePane } from './scene-pane'

const emptyGraph: SceneGraph = {
  nodes: [],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

const graphWithGeometry: SceneGraph = {
  ...emptyGraph,
  walls: [
    {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      thickness: 100,
    },
  ],
}

// Each case states the active floor and whether the canvas wrapper shows a failure view.
let mockSceneGraph: SceneGraph = graphWithGeometry
let mockFailureKind: 'load' | 'start' | null = null

// The stand-in canvas never reports a first frame (data-harness-ready stays "false"), as a
// canvas whose renderer failed never does. When a failure kind is set, it renders the real
// failure host, as the real wrapper does in place of the 3D view.
vi.mock('../../bridge', () => ({
  // A component export legitimately keeps its PascalCase name in the mock.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SceneCanvas: () => (
    <div data-testid="live-scene-canvas" data-harness-ready="false">
      {mockFailureKind === null ? null : (
        <SceneFailureHost kind={mockFailureKind} onReload={vi.fn()} />
      )}
    </div>
  ),
  useSceneGraph: () => mockSceneGraph,
  useActiveFloorId: () => 'g',
  detectRenderBackend: () => 'webgpu',
}))

afterEach(() => {
  mockSceneGraph = graphWithGeometry
  mockFailureKind = null
})

const LOAD_TITLE = 'Could not load the 3D view'
const START_TITLE = 'This browser cannot render the 3D view'

describe.each(['load', 'start'] as const)('ScenePane over a renderer that failed to %s', (kind) => {
  it('drops the loading overlay while the failure view is in the pane', async () => {
    mockFailureKind = kind

    render(<ScenePane />)

    await waitFor(() => {
      expect(screen.queryByText('Building the scene...')).toBeNull()
    })
  })

  it('drops the empty-floor guidance too, and keeps the failure view visible', async () => {
    mockFailureKind = kind
    mockSceneGraph = emptyGraph

    render(<ScenePane />)

    await waitFor(() => {
      expect(screen.queryByText('Building the scene...')).toBeNull()
    })
    expect(screen.queryByText('Nothing to show in 3D yet')).toBeNull()
    expect(
      screen.getByRole('heading', { name: kind === 'load' ? LOAD_TITLE : START_TITLE }),
    ).toBeInTheDocument()
  })

  it('shows the styled view in the slot, not the plain one', async () => {
    mockFailureKind = kind

    render(<ScenePane />)

    expect(
      await screen.findByRole('heading', { name: kind === 'load' ? LOAD_TITLE : START_TITLE }),
    ).toBeInTheDocument()
    if (kind === 'load') {
      expect(screen.getByRole('button', { name: 'Reload page' })).toHaveClass('ds-button')
    }
  })
})

describe('ScenePane over a renderer that has not failed', () => {
  it('still shows the loading overlay until the scene is ready', () => {
    render(<ScenePane />)

    expect(screen.getByText('Building the scene...')).toBeInTheDocument()
  })
})
