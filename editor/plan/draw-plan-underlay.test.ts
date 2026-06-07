import { describe, it, expect } from 'vitest'
import { drawPlan } from './draw-plan'
import { recordingContext, sampleWall as wall } from './draw-plan-test-fixtures'
import type { DrawableUnderlay, UnderlayImage } from './draw-underlay'
import { DEFAULT_PLAN_SCALE } from './viewport'
import type { UnderlaySceneNode } from '../../core'

/** A minimal valid `drawPlan` options object that tests override per case. */
function planOptions(overrides: Partial<Parameters<typeof drawPlan>[1]> = {}) {
  return {
    walls: [wall],
    viewport: { scale: DEFAULT_PLAN_SCALE },
    width: 800,
    height: 600,
    selectedIds: new Set<string>(),
    ...overrides,
  }
}

describe('drawPlan underlays and calibration', () => {
  // The wall stroke uses this color while unselected, so any segment whose style
  // differs from it (and is not the selected color) must be the calibration line.
  const WALL_COLOR = '#222222'
  const SELECTED_WALL_COLOR = '#1a7fd4'

  function drawable(overrides: Partial<UnderlaySceneNode> = {}): DrawableUnderlay {
    const node: UnderlaySceneNode = {
      id: 'underlay:a',
      kind: 'underlay',
      floorId: 'f',
      image: { scope: 'project', contentHash: 'sha256-abc' },
      width: 800,
      height: 600,
      placement: { offset: { x: 1000, y: 500 }, millimetersPerPixel: 10, rotation: 0 },
      opacity: 0.6,
      visible: true,
      ...overrides,
    }
    const image: UnderlayImage = { width: node.width, height: node.height }
    return { node, image }
  }

  it('paints a visible underlay beneath the grid as the bottom layer', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, planOptions({ grid: true, underlays: [drawable()] }))

    const { ops } = recorder
    const drawImageIndex = ops.indexOf('drawImage')
    expect(recorder.images).toHaveLength(1)
    expect(drawImageIndex).toBeGreaterThan(ops.indexOf('clearRect'))
    // The underlay is the bottom layer: it paints before the first grid path and
    // before any stroke (grid lines, walls, preview).
    expect(drawImageIndex).toBeLessThan(ops.indexOf('beginPath'))
    expect(drawImageIndex).toBeLessThan(ops.indexOf('stroke'))
  })

  it('skips an invisible underlay while still painting a visible sibling', () => {
    const recorder = recordingContext()
    const underlays = [
      drawable({ id: 'underlay:hidden', visible: false }),
      drawable({ id: 'underlay:shown' }),
    ]

    drawPlan(recorder.ctx, planOptions({ underlays }))

    // Exactly one of the two underlays is visible, so exactly one bitmap paints.
    expect(recorder.images).toHaveLength(1)
    expect(recorder.ops.filter((op) => op === 'drawImage')).toHaveLength(1)
  })

  it('paints the calibration measure line above the walls', () => {
    const recorder = recordingContext()
    const calibration = { start: { x: 1200, y: 800 }, end: { x: 3400, y: 2600 } }

    // Grid and rulers stay off so the only stroked segments are the wall and the
    // calibration line; the calibration line is identified by its distinct style.
    drawPlan(recorder.ctx, planOptions({ calibration }))

    const { segments } = recorder
    const wallIndex = segments.findIndex((segment) => segment.style === WALL_COLOR)
    const calibrationIndex = segments.findIndex(
      (segment) => segment.style !== WALL_COLOR && segment.style !== SELECTED_WALL_COLOR,
    )

    expect(wallIndex).toBeGreaterThanOrEqual(0)
    expect(calibrationIndex).toBeGreaterThanOrEqual(0)
    // The calibration overlay sits on top of the plan, so it strokes after the wall.
    expect(calibrationIndex).toBeGreaterThan(wallIndex)
  })

  it('records no underlay paint when neither underlays nor calibration is set', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, planOptions())

    expect(recorder.ops).not.toContain('drawImage')
    expect(recorder.images).toHaveLength(0)
    expect(recorder.segments).toHaveLength(1)
  })
})
