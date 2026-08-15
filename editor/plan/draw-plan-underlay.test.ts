import { describe, it, expect } from 'vitest'
import { drawPlan } from './draw-plan'
import { recordingContext, sampleWall as wall } from './draw-plan-test-fixtures'
import type { DrawableUnderlay, UnderlayImage } from './draw-underlay'
import { DEFAULT_PLAN_SCALE } from './viewport'
import { DEFAULT_PLAN_PALETTE } from './plan-palette'
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
  const WALL_COLOR = DEFAULT_PLAN_PALETTE.wall
  const SELECTED_WALL_COLOR = DEFAULT_PLAN_PALETTE.selection

  /**
   * The index of the last recorded segment whose style satisfies `matches`, or -1
   * if none do. The wall's poche fill traces its ring with whatever stroke style
   * happened to be current (it is filled, not stroked), so a style match can land
   * on a poche edge as well as a genuine stroked line; taking the last match
   * instead of the first keeps the search pinned to what was drawn most recently.
   */
  function lastIndexOfStyle(
    segments: readonly { style: string }[],
    matches: (style: string) => boolean,
  ): number {
    let found = -1
    segments.forEach((segment, index) => {
      if (matches(segment.style)) found = index
    })
    return found
  }

  function drawable(overrides: Partial<UnderlaySceneNode> = {}): DrawableUnderlay {
    const node: UnderlaySceneNode = {
      id: 'underlay:a',
      kind: 'underlay',
      floorId: 'f',
      source: { kind: 'raster', image: { scope: 'project', contentHash: 'sha256-abc' } },
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

  it("paints the calibration measure line above the wall's last face line", () => {
    const recorder = recordingContext()
    const calibration = { start: { x: 1200, y: 800 }, end: { x: 3400, y: 2600 } }

    // Grid and rulers stay off so the only stroked geometry is the wall's poche
    // ring, its two face lines, and the calibration line.
    drawPlan(recorder.ctx, planOptions({ calibration }))

    const { segments } = recorder
    // The face lines are the segments carrying the wall ink color; take the last
    // match so this stays true no matter how many segments the poche ring itself
    // contributes.
    const lastWallFaceIndex = lastIndexOfStyle(segments, (style) => style === WALL_COLOR)
    const calibrationIndex = lastIndexOfStyle(
      segments,
      (style) => style !== WALL_COLOR && style !== SELECTED_WALL_COLOR,
    )

    expect(lastWallFaceIndex).toBeGreaterThanOrEqual(0)
    expect(calibrationIndex).toBeGreaterThanOrEqual(0)
    // The calibration overlay sits on top of the plan, so it strokes after the
    // wall's last face line.
    expect(calibrationIndex).toBeGreaterThan(lastWallFaceIndex)
  })

  it('records no underlay paint when neither underlays nor calibration is set', () => {
    const recorder = recordingContext()
    drawPlan(recorder.ctx, planOptions())

    const withCalibration = recordingContext()
    const calibration = { start: { x: 1200, y: 800 }, end: { x: 3400, y: 2600 } }
    drawPlan(withCalibration.ctx, planOptions({ calibration }))

    expect(recorder.ops).not.toContain('drawImage')
    expect(recorder.images).toHaveLength(0)
    // Calibration adds its own measure-line segment on top of the same walls, so
    // the calibration-free call paints strictly fewer segments; this stays true
    // whatever the wall symbology itself contributes, unlike a hardcoded count.
    expect(recorder.segments.length).toBeLessThan(withCalibration.segments.length)
  })
})
