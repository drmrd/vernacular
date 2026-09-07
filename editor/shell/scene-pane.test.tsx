import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import type { SceneGraph } from '../../core'
import type { LivePreviewBackend } from '../../bridge'
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

// Which backend the runtime can drive. The pane asks the bridge probe rather than
// navigator directly, so each test states the runtime it means here.
let mockBackend: LivePreviewBackend = 'webgpu'

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
    return <div data-testid="live-scene-canvas" data-harness-ready="false" />
  },
  useSceneGraph: () => mockSceneGraph,
  useActiveFloorId: () => 'g',
  detectLivePreviewBackend: () => mockBackend,
}))

describe('ScenePane', () => {
  afterEach(() => {
    mockSceneGraph = graphWithGeometry
    mockBackend = 'webgpu'
    suspendSceneCanvasOnce = false
    sceneCanvasResolved = false
    resolveSceneCanvas = null
  })

  it('renders the styled empty-state fallback when the runtime can render no 3D at all', () => {
    mockBackend = 'unsupported'

    const { container } = render(<ScenePane />)

    // The design-system EmptyState title, not a bare unstyled string.
    expect(screen.getByText(/3D preview unavailable/i)).toBeInTheDocument()
    // Missing WebGPU is no longer the reason a preview is unavailable, so the copy
    // must not blame it: a WebGL 2 browser reaches the live view instead.
    expect(screen.queryByText(/WebGPU/i)).toBeNull()
    // Rendered through the EmptyState primitive (its section markup), not a raw div.
    expect(container.querySelector('.ds-status--empty')).not.toBeNull()
  })

  it('reassures the user without nesting a duplicate region landmark', () => {
    mockBackend = 'unsupported'

    const { container } = render(<ScenePane />)

    // The reassurance copy that the plan and 2D editor are unaffected.
    expect(screen.getByText(/2D editor are unaffected/i)).toBeInTheDocument()
    // The shell pane already owns the labeled region, so the EmptyState must be
    // rendered with asRegion={false}: no nested region landmark inside the fallback.
    expect(screen.queryByRole('region')).toBeNull()
    expect(container.querySelector('.ds-status--empty')?.getAttribute('role')).toBeNull()
  })

  it('renders the live scene rather than the fallback when WebGPU is available', () => {
    mockBackend = 'webgpu'

    render(<ScenePane />)

    // The non-fallback branch is taken: the fallback copy is absent and the
    // delegated scene canvas renders instead.
    expect(screen.queryByText(/3D preview unavailable/i)).toBeNull()
    expect(screen.getByTestId('live-scene-canvas')).toBeInTheDocument()
  })

  it('renders the live scene when the runtime falls back to WebGL 2', () => {
    // The renderer targets WebGPU when it is there and falls back to its own WebGL 2
    // backend when it is not, and that fallback path is what every committed scene
    // baseline renders through. A WebGL 2 browser therefore gets the preview.
    mockBackend = 'webgl2'

    render(<ScenePane />)

    expect(screen.queryByText(/3D preview unavailable/i)).toBeNull()
    expect(screen.getByTestId('live-scene-canvas')).toBeInTheDocument()
  })

  it('keeps the live scene canvas mounted and overlays empty-floor guidance when the active floor has no geometry', async () => {
    mockBackend = 'webgpu'
    mockSceneGraph = emptyGraph

    const { container } = render(<ScenePane />)

    // The loading line owns the not-ready state, so mark the canvas ready
    // before asserting the guidance (the readiness observer reacts async).
    act(() => {
      screen.getByTestId('live-scene-canvas').setAttribute('data-harness-ready', 'true')
    })

    // The geometry-empty title and guidance copy from the design-system EmptyState.
    expect(await screen.findByText(/Nothing to show in 3D yet/i)).toBeInTheDocument()
    expect(screen.getByText(/Draw walls in plan view/i)).toBeInTheDocument()
    // Rendered through the EmptyState primitive, not a raw div.
    expect(container.querySelector('.ds-status--empty')).not.toBeNull()
    // The scene canvas subtree stays mounted underneath the guidance rather
    // than being swapped out, so the toolbar, camera, and whole-building
    // scope toggle it hosts keep their mounted state.
    expect(screen.getByTestId('live-scene-canvas')).toBeInTheDocument()
    // The shell pane already owns the labeled region, so the EmptyState is
    // rendered with asRegion={false}: no nested region landmark.
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('does not unmount the live scene canvas when the active floor transitions from having geometry to being empty', () => {
    mockBackend = 'webgpu'
    mockSceneGraph = graphWithGeometry

    const { rerender } = render(<ScenePane />)
    const canvasBeforeTransition = screen.getByTestId('live-scene-canvas')

    mockSceneGraph = emptyGraph
    rerender(<ScenePane />)

    // The same canvas DOM node persists across the transition instead of
    // being torn down and rebuilt when the empty-floor overlay appears, so
    // the toolbar, camera, and whole-building scope toggle it hosts do not
    // lose their mounted state.
    expect(screen.getByTestId('live-scene-canvas')).toBe(canvasBeforeTransition)
  })

  it('shows a loading fallback while the live 3D canvas boots, then the canvas', async () => {
    mockBackend = 'webgpu'
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

  it('shows the loading placeholder for a canvas that mounts late already not-ready', async () => {
    mockBackend = 'webgpu'
    mockSceneGraph = graphWithGeometry
    // The canvas suspends first, so it is not present in the tree at mount
    // time. When it resolves, it is inserted into the pane subtree already
    // carrying data-harness-ready="false" rather than being created empty
    // and mutated afterward. The readiness observer must catch this
    // insertion, not just later attribute changes on an already-mounted node.
    suspendSceneCanvasOnce = true

    render(<ScenePane />)
    expect(screen.getByText(/Preparing 3D view/i)).toBeInTheDocument()

    resolveSceneCanvas?.()

    const canvasNode = await screen.findByTestId('live-scene-canvas')
    expect(canvasNode.getAttribute('data-harness-ready')).toBe('false')
    expect(await screen.findByText(/building the scene/i)).toBeInTheDocument()

    act(() => {
      canvasNode.setAttribute('data-harness-ready', 'true')
    })

    await waitFor(() => {
      expect(screen.queryByText(/building the scene/i)).toBeNull()
    })
  })

  it('shows a quiet placeholder until the scene canvas signals its first frame is ready, then clears it', async () => {
    mockBackend = 'webgpu'
    mockSceneGraph = graphWithGeometry

    render(<ScenePane />)

    // The live canvas mounts right away (no Suspense in play here), but its
    // data-harness-ready attribute starts at "false": the first frame has not
    // settled yet. ScenePane observes that attribute from outside the canvas
    // subtree, so a quiet loading line covers the gap instead of showing
    // nothing while the scene assembles.
    const canvasNode = screen.getByTestId('live-scene-canvas')
    expect(canvasNode.getAttribute('data-harness-ready')).toBe('false')
    expect(screen.getByText(/building the scene/i)).toBeInTheDocument()

    // The canvas subtree flips the attribute once its first frame settles.
    act(() => {
      canvasNode.setAttribute('data-harness-ready', 'true')
    })

    // Attribute observation is asynchronous, so the placeholder clears on a
    // later tick rather than synchronously with the mutation above.
    await waitFor(() => {
      expect(screen.queryByText(/building the scene/i)).toBeNull()
    })
  })

  it('shows only the loading placeholder over an empty floor until the scene is ready, then swaps to the empty-floor guidance', async () => {
    mockBackend = 'webgpu'
    mockSceneGraph = emptyGraph

    render(<ScenePane />)

    // The floor has no geometry and the canvas has not reported its first
    // frame yet, so both overlay conditions are true at once. The loading
    // placeholder must win: the empty-floor guidance is not also shown.
    const canvasNode = screen.getByTestId('live-scene-canvas')
    expect(canvasNode.getAttribute('data-harness-ready')).toBe('false')
    expect(screen.getByText(/building the scene/i)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing to show in 3D yet/i)).toBeNull()

    // Once the canvas signals its first frame is ready, the empty-floor
    // guidance takes over and the loading line clears.
    act(() => {
      canvasNode.setAttribute('data-harness-ready', 'true')
    })

    await waitFor(() => {
      expect(screen.getByText(/Nothing to show in 3D yet/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/building the scene/i)).toBeNull()
  })
})
