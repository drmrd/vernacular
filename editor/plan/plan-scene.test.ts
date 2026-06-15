import { describe, it, expect } from 'vitest'
import { DEFAULT_METRIC_PREFERENCES } from '../../core'
import { buildDrawOptions, type PlanScene } from './plan-scene'
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

    const options = buildDrawOptions(emptyScene(), palette)

    expect(options.palette).toBe(palette)
  })
})
