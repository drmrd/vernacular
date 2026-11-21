import { describe, it, expect, afterEach } from 'vitest'
import { createElement, useEffect, type ReactElement } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { DEFAULT_METRIC_PREFERENCES, type DimensionSceneNode, type SceneGraph } from '../../core'
import {
  ViewOverlayProvider,
  useViewOverlay,
  type ViewOverlayValue,
} from '../viewport/view-overlay-context'
import { recordingContext } from './draw-plan-test-fixtures'
import {
  PLAN_HEIGHT,
  PLAN_WIDTH,
  buildDrawOptions,
  scopeSceneToShownAnnotations,
  usePlanRedraw,
  type PlanScene,
} from './plan-scene'
import { DEFAULT_PLAN_PALETTE, type PlanPalette } from './plan-palette'
import { DEFAULT_PLAN_SCALE, type ViewportSize } from './viewport'

// A scene with no entities, used to check the option assembly in isolation.
function emptyScene(): PlanScene {
  const viewport = { scale: DEFAULT_PLAN_SCALE }
  return {
    walls: [],
    rooms: [],
    selectedIds: new Set<string>(),
    hoveredId: undefined,
    preview: undefined,
    snap: null,
    marquee: undefined,
    endpointHandles: null,
    openingResizeHandles: null,
    viewport,
    size: { width: PLAN_WIDTH, height: PLAN_HEIGHT },
    preferences: DEFAULT_METRIC_PREFERENCES,
    underlays: [],
    openings: [],
    furniture: [],
    dimensions: [],
    stairs: [],
    calibration: undefined,
    ghost: [],
    surfacePaint: {
      treatmentForFace: () => undefined,
      activeSurface: null,
    },
    roomFillColor: undefined,
  }
}

describe('buildDrawOptions', () => {
  it('threads the resolved palette into the draw options', () => {
    const palette: PlanPalette = { ...DEFAULT_PLAN_PALETTE, grid: '#123456' }

    const options = buildDrawOptions(emptyScene(), palette, {
      showGrid: true,
      showDimensions: true,
    })

    expect(options.palette).toBe(palette)
  })
})

type Recorder = ReturnType<typeof recordingContext>

// A distinct grid color so the grid lines are the only strokes carrying it, and
// the ruler band keeps its own fill, letting one draw answer for both layers.
const PROBE_PALETTE: PlanPalette = { ...DEFAULT_PLAN_PALETTE, grid: '#123456' }

function gridLineCount(recorder: Recorder): number {
  return recorder.segments.filter((segment) => segment.style === PROBE_PALETTE.grid).length
}

function rulerBandCount(recorder: Recorder): number {
  return recorder.fillRects.filter((rect) => rect.style === PROBE_PALETTE.rulerBand).length
}

interface RedrawProbe {
  lastDraw: () => Recorder
  overlay: () => ViewOverlayValue
}

/**
 * Renders `usePlanRedraw` under a live `ViewOverlayProvider` against a canvas that
 * hands out a fresh recorder per draw, so each redraw is inspected on its own
 * instead of accumulating onto the draw before it. jsdom has no 2D canvas, so the
 * element is a stand-in exposing only the `getContext` the redraw calls.
 */
function renderRedraw(scene: PlanScene): RedrawProbe {
  const draws: Recorder[] = []
  const canvasRef = {
    current: {
      getContext: () => {
        const recorder = recordingContext()
        draws.push(recorder)
        return recorder.ctx
      },
    } as unknown as HTMLCanvasElement,
  }
  let overlay: ViewOverlayValue | undefined
  function Probe() {
    overlay = useViewOverlay()
    usePlanRedraw(canvasRef, scene, PROBE_PALETTE)
    return null
  }
  render(createElement(ViewOverlayProvider, null, createElement(Probe)))
  return {
    lastDraw: () => {
      const recorder = draws.at(-1)
      if (recorder === undefined) throw new Error('the plan never drew')
      return recorder
    },
    overlay: () => {
      if (overlay === undefined) throw new Error('the probe never read the view overlay')
      return overlay
    },
  }
}

describe('the header Grid toggle', () => {
  afterEach(cleanup)

  it('clears the grid from the next draw and leaves the rulers standing', () => {
    const probe = renderRedraw(emptyScene())
    expect(gridLineCount(probe.lastDraw())).toBeGreaterThan(0)

    act(() => probe.overlay().toggleGrid())

    expect(gridLineCount(probe.lastDraw())).toBe(0)
    // The toggle is labeled Grid alone, and the spec lists the rulers as their own
    // canvas-chrome layer, so they stay whatever the grid does.
    expect(rulerBandCount(probe.lastDraw())).toBeGreaterThan(0)
  })
})

// A horizontal one-meter dimension offset from what it measures, the fixture shape
// draw-dimension's own tests use. In a scene holding nothing else, its line, two
// extension lines, and two arrowheads are the only strokes carrying the wall ink.
const DIMENSION_LENGTH_MM = 1000
const DIMENSION_OFFSET_MM = 200

function dimensionNode(): DimensionSceneNode {
  return {
    id: 'dimension:d1',
    kind: 'dimension',
    floorId: 'g',
    start: { x: 0, y: 0 },
    end: { x: DIMENSION_LENGTH_MM, y: 0 },
    offset: DIMENSION_OFFSET_MM,
    length: DIMENSION_LENGTH_MM,
  }
}

function sceneWithDimension(): PlanScene {
  return { ...emptyScene(), dimensions: [{ node: dimensionNode(), selected: false }] }
}

function dimensionMarkCount(recorder: Recorder): number {
  return recorder.segments.filter((segment) => segment.style === PROBE_PALETTE.wall).length
}

function dimensionLabelCount(recorder: Recorder): number {
  return recorder.texts.filter((text) => text.style === PROBE_PALETTE.label).length
}

describe('scopeSceneToShownAnnotations', () => {
  // The plan's DOM overlay reads its measurement chips and their focusable proxies
  // off the scene graph rather than the draw options, so hiding the dimensions has
  // to reach the graph the overlay sees or the numbers stay on screen alone.
  const graph: SceneGraph = {
    nodes: [],
    walls: [],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [dimensionNode()],
    stairs: [],
    furniture: [],
  }

  it('empties the dimensions the Dimensions toggle hides', () => {
    const scoped = scopeSceneToShownAnnotations(graph, { showGrid: true, showDimensions: false })

    expect(scoped.dimensions).toEqual([])
  })

  it('hands back the graph untouched while the dimensions show', () => {
    const scoped = scopeSceneToShownAnnotations(graph, { showGrid: true, showDimensions: true })

    expect(scoped).toBe(graph)
  })
})

describe('the header Dimensions toggle', () => {
  afterEach(cleanup)

  it('leaves the dimension pass out of the next draw', () => {
    const probe = renderRedraw(sceneWithDimension())
    expect(dimensionMarkCount(probe.lastDraw())).toBeGreaterThan(0)
    expect(dimensionLabelCount(probe.lastDraw())).toBeGreaterThan(0)

    act(() => probe.overlay().toggleDimensions())

    expect(dimensionMarkCount(probe.lastDraw())).toBe(0)
    expect(dimensionLabelCount(probe.lastDraw())).toBe(0)
  })
})

const SMALL_STAGE: ViewportSize = { width: 640, height: 480 }
const LARGE_STAGE: ViewportSize = { width: 1024, height: 768 }

describe('buildDrawOptions stage size', () => {
  it("draws at the scene's stage size, not the nominal size", () => {
    const options = buildDrawOptions({ ...emptyScene(), size: LARGE_STAGE }, DEFAULT_PLAN_PALETTE, {
      showGrid: true,
      showDimensions: true,
    })

    expect(options.width).toBe(LARGE_STAGE.width)
    expect(options.height).toBe(LARGE_STAGE.height)
  })
})

// The ruler bands span the stage's top and left edges, so their far edge is the stage size.
function rulerReach(recorder: Recorder): ViewportSize {
  const bands = recorder.fillRects.filter((rect) => rect.style === PROBE_PALETTE.rulerBand)
  return {
    width: Math.max(...bands.map((band) => band.x + band.w)),
    height: Math.max(...bands.map((band) => band.y + band.h)),
  }
}

interface ResizeProbe {
  draws: Recorder[]
  commitLog: string[]
  resize: (size: ViewportSize) => void
}

// A child's passive effect logs beside every draw, so the log order tells whether a
// draw ran in the layout phase or after the passive effects of its commit.
function renderResizableRedraw(scene: PlanScene): ResizeProbe {
  const draws: Recorder[] = []
  const commitLog: string[] = []
  const canvasRef = {
    current: {
      getContext: () => {
        const recorder = recordingContext()
        draws.push(recorder)
        commitLog.push('draw')
        return recorder.ctx
      },
    } as unknown as HTMLCanvasElement,
  }
  function PassiveMarker() {
    useEffect(() => {
      commitLog.push('passive')
    })
    return null
  }
  function Probe({ current }: { current: PlanScene }) {
    usePlanRedraw(canvasRef, current, PROBE_PALETTE)
    return createElement(PassiveMarker)
  }
  const tree = (current: PlanScene): ReactElement =>
    createElement(ViewOverlayProvider, null, createElement(Probe, { current }))
  const { rerender } = render(tree(scene))
  return {
    draws,
    commitLog,
    resize: (size) => rerender(tree({ ...scene, size })),
  }
}

describe('the plan redraw when the stage resizes', () => {
  afterEach(cleanup)

  it('redraws at the new width and height when only the stage size changes', () => {
    const probe = renderResizableRedraw({ ...emptyScene(), size: SMALL_STAGE })
    expect(rulerReach(probe.draws.at(-1)!)).toEqual(SMALL_STAGE)
    const drawsBefore = probe.draws.length

    act(() => probe.resize(LARGE_STAGE))

    expect(probe.draws.length).toBeGreaterThan(drawsBefore)
    expect(rulerReach(probe.draws.at(-1)!)).toEqual(LARGE_STAGE)
  })

  it('redraws in the layout phase of the commit that changes the size', () => {
    const probe = renderResizableRedraw({ ...emptyScene(), size: SMALL_STAGE })
    probe.commitLog.length = 0

    act(() => probe.resize(LARGE_STAGE))

    // Setting a canvas width clears it, so a later draw would paint one blank frame.
    expect(probe.commitLog[0]).toBe('draw')
  })
})
