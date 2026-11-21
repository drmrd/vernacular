import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import {
  buildWallGraph,
  DEFAULT_METRIC_PREFERENCES,
  type Point,
  type WallSceneNode,
} from '../../core'
import { ViewOverlayProvider } from '../viewport/view-overlay-context'
import { recordingContext, sampleWall } from './draw-plan-test-fixtures'
import { DEFAULT_PLAN_PALETTE } from './plan-palette'
import { PLAN_HEIGHT, PLAN_WIDTH, usePlanRedraw, type PlanScene } from './plan-scene'
import { DEFAULT_PLAN_SCALE, worldToScreen, type Viewport } from './viewport'

// A pass-through spy: the real builder still runs, the mock only counts the calls.
vi.mock('../../core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core')>()
  return { ...actual, buildWallGraph: vi.fn(actual.buildWallGraph) }
})

type Recorder = ReturnType<typeof recordingContext>

const ZOOMED_IN_FACTOR = 2
const MOVED_WALL_END: Point = { x: 2000, y: 0 }
const SCREEN_TOLERANCE_PX = 1e-6

const INITIAL_VIEWPORT: Viewport = { scale: DEFAULT_PLAN_SCALE }
const ZOOMED_VIEWPORT: Viewport = { scale: DEFAULT_PLAN_SCALE * ZOOMED_IN_FACTOR }

function sceneOver(walls: WallSceneNode[], viewport: Viewport): PlanScene {
  return {
    walls,
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

interface RedrawProbe {
  draws: Recorder[]
  redrawOver: (scene: PlanScene) => void
}

/**
 * Mounts `usePlanRedraw` once against a canvas that hands out a fresh recorder per
 * draw, and lets the test hand the same mounted plan a new scene. jsdom has no 2D
 * canvas, so the element is a stand-in exposing only the `getContext` the redraw calls.
 */
function mountPlan(first: PlanScene): RedrawProbe {
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
  function Probe({ scene }: { scene: PlanScene }) {
    usePlanRedraw(canvasRef, scene, DEFAULT_PLAN_PALETTE)
    return null
  }
  const view = (scene: PlanScene) =>
    createElement(ViewOverlayProvider, null, createElement(Probe, { scene }))
  const mounted = render(view(first))
  return { draws, redrawOver: (scene) => mounted.rerender(view(scene)) }
}

function wallInkEndsAtScreenX(recorder: Recorder, screenX: number): boolean {
  return recorder.segments
    .filter((segment) => segment.style === DEFAULT_PLAN_PALETTE.wall)
    .some((segment) =>
      [segment.from[0], segment.to[0]].some((x) => Math.abs(x - screenX) < SCREEN_TOLERANCE_PX),
    )
}

describe('the plan wall graph across redraws', () => {
  beforeEach(() => {
    vi.mocked(buildWallGraph).mockClear()
  })
  afterEach(cleanup)

  it('builds the wall graph once for two redraws over the same walls', () => {
    const walls = [sampleWall]
    const plan = mountPlan(sceneOver(walls, INITIAL_VIEWPORT))

    plan.redrawOver(sceneOver(walls, ZOOMED_VIEWPORT))

    expect(plan.draws).toHaveLength(2)
    expect(buildWallGraph).toHaveBeenCalledTimes(1)
  })

  it('builds the wall graph again after the walls change and draws the moved wall', () => {
    const walls = [sampleWall]
    const plan = mountPlan(sceneOver(walls, INITIAL_VIEWPORT))
    plan.redrawOver(sceneOver(walls, ZOOMED_VIEWPORT))
    const movedWalls = [{ ...sampleWall, end: MOVED_WALL_END }]

    plan.redrawOver(sceneOver(movedWalls, ZOOMED_VIEWPORT))

    expect(plan.draws).toHaveLength(3)
    expect(buildWallGraph).toHaveBeenCalledTimes(2)
    const movedEndX = worldToScreen(MOVED_WALL_END, ZOOMED_VIEWPORT).x
    expect(wallInkEndsAtScreenX(plan.draws[2] as Recorder, movedEndX)).toBe(true)
  })
})
