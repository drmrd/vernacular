import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { SceneGraph } from '../../core'
import { ScenePane } from './scene-pane'

// An empty scene graph: no walls/rooms/openings/stairs/furniture, so the real
// core sceneGraphForFloor + sceneGraphHasGeometry treat it as having no 3D
// geometry on any floor. The bridge hooks below feed this to ScenePane.
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

// A graph with one wall on floor "g": real core helpers report 3D geometry, so
// ScenePane delegates to the live canvas. This is the default so the existing
// WebGPU-available test keeps rendering the live stub unchanged.
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

// Mockable scene-graph state so each test can drive the empty/non-empty branch.
let mockSceneGraph: SceneGraph = graphWithGeometry

// When true, the mocked SceneCanvas suspends on its first render (throws a
// promise) before resolving to the live stub. This mimics how R3F's <Canvas>
// suspends its subtree until the renderer boots and the first frame is ready,
// so the Suspense fallback ScenePane provides is exercised in jsdom. Defaults
// to false so the other tests render the plain stub unchanged.
let suspendSceneCanvasOnce = false
let sceneCanvasResolved = false
let resolveSceneCanvas: (() => void) | null = null

// Mock the bridge SceneCanvas at the module edge ScenePane imports so the
// WebGPU-present branch renders a lightweight stub. This keeps the unit under
// test "which branch ScenePane selects," not the R3F/WebGPU renderer internals.
// useSceneGraph/useActiveFloorId are stubbed so ScenePane can scope the graph
// to the active floor and pick the empty-geometry branch.
vi.mock('../../bridge', () => ({
  // A component export legitimately keeps its PascalCase name in the mock.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SceneCanvas: () => {
    if (suspendSceneCanvasOnce && !sceneCanvasResolved) {
      throw new Promise<void>((resolve) => {
        resolveSceneCanvas = () => {
          sceneCanvasResolved = true
          resolve()
        }
      })
    }
    return <div data-testid="live-scene-canvas" />
  },
  useSceneGraph: () => mockSceneGraph,
  useActiveFloorId: () => 'g',
}))

describe('ScenePane', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mockSceneGraph = graphWithGeometry
    suspendSceneCanvasOnce = false
    sceneCanvasResolved = false
    resolveSceneCanvas = null
  })

  it('renders the styled empty-state fallback when WebGPU is unavailable', () => {
    vi.stubGlobal('navigator', {})

    const { container } = render(<ScenePane />)

    // The design-system EmptyState title, not a bare unstyled string.
    expect(screen.getByText(/3D preview unavailable/i)).toBeInTheDocument()
    // Rendered through the EmptyState primitive (its section markup), not a raw div.
    expect(container.querySelector('.ds-status--empty')).not.toBeNull()
  })

  it('reassures the user without nesting a duplicate region landmark', () => {
    vi.stubGlobal('navigator', {})

    const { container } = render(<ScenePane />)

    // The reassurance copy that the plan and 2D editor are unaffected.
    expect(screen.getByText(/2D editor are unaffected/i)).toBeInTheDocument()
    // The shell pane already owns the labeled region, so the EmptyState must be
    // rendered with asRegion={false}: no nested region landmark inside the fallback.
    expect(screen.queryByRole('region')).toBeNull()
    expect(container.querySelector('.ds-status--empty')?.getAttribute('role')).toBeNull()
  })

  it('renders the live scene rather than the fallback when WebGPU is available', () => {
    vi.stubGlobal('navigator', { gpu: {} })

    render(<ScenePane />)

    // The non-fallback branch is taken: the fallback copy is absent and the
    // delegated scene canvas renders instead.
    expect(screen.queryByText(/3D preview unavailable/i)).toBeNull()
    expect(screen.getByTestId('live-scene-canvas')).toBeInTheDocument()
  })

  it('shows an empty state when WebGPU is available but the active floor has no geometry', () => {
    vi.stubGlobal('navigator', { gpu: {} })
    mockSceneGraph = emptyGraph

    const { container } = render(<ScenePane />)

    // The geometry-empty title and guidance copy from the design-system EmptyState.
    expect(screen.getByText(/Nothing to show in 3D yet/i)).toBeInTheDocument()
    expect(screen.getByText(/Draw walls in plan view/i)).toBeInTheDocument()
    // Rendered through the EmptyState primitive, not a raw div.
    expect(container.querySelector('.ds-status--empty')).not.toBeNull()
    // The live canvas must not mount when there is nothing to draw.
    expect(screen.queryByTestId('live-scene-canvas')).toBeNull()
    // The shell pane already owns the labeled region, so the EmptyState is
    // rendered with asRegion={false}: no nested region landmark.
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('shows a loading fallback while the live 3D canvas boots, then the canvas', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    // Geometry is present, so the empty branch is not taken and ScenePane must
    // delegate to the live canvas. Make that canvas suspend on first render to
    // exercise the Suspense fallback ScenePane wraps it in.
    suspendSceneCanvasOnce = true

    render(<ScenePane />)

    // While the canvas subtree suspends, the design-system LoadingState fallback
    // shows the "Preparing 3D view..." message and the live canvas is not yet
    // mounted.
    expect(screen.getByText(/Preparing 3D view/i)).toBeInTheDocument()
    expect(screen.queryByTestId('live-scene-canvas')).toBeNull()

    // Once the renderer resolves, the live canvas replaces the fallback.
    resolveSceneCanvas?.()
    await waitFor(() => {
      expect(screen.getByTestId('live-scene-canvas')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Preparing 3D view/i)).toBeNull()
  })
})
