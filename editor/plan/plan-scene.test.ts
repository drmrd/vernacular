import { describe, it, expect, afterEach } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { DEFAULT_METRIC_PREFERENCES, type DimensionSceneNode } from '../../core'
import {
  ViewOverlayProvider,
  useViewOverlay,
  type ViewOverlayValue,
} from '../viewport/view-overlay-context'
import { recordingContext } from './draw-plan-test-fixtures'
import { buildDrawOptions, usePlanRedraw, type PlanScene } from './plan-scene'
import { DEFAULT_PLAN_PALETTE, type PlanPalette } from './plan-palette'
import { DEFAULT_PLAN_SCALE } from './viewport'

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

function sceneWithDimension(): PlanScene {
  const node: DimensionSceneNode = {
    id: 'dimension:d1',
    kind: 'dimension',
    floorId: 'g',
    start: { x: 0, y: 0 },
    end: { x: DIMENSION_LENGTH_MM, y: 0 },
    offset: DIMENSION_OFFSET_MM,
    length: DIMENSION_LENGTH_MM,
  }
  return { ...emptyScene(), dimensions: [{ node, selected: false }] }
}

function dimensionMarkCount(recorder: Recorder): number {
  return recorder.segments.filter((segment) => segment.style === PROBE_PALETTE.wall).length
}

function dimensionLabelCount(recorder: Recorder): number {
  return recorder.texts.filter((text) => text.style === PROBE_PALETTE.label).length
}

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
