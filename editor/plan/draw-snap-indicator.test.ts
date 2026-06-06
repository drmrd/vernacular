import { describe, it, expect } from 'vitest'
import { drawPlan, drawSnapIndicator } from './draw-plan'
import { recordingContext, sampleWall } from './draw-plan-test-fixtures'
import { DEFAULT_PLAN_SCALE, worldToScreen } from './viewport'
import type { SnapResult } from './snap'

describe('drawSnapIndicator', () => {
  it('paints a marker centered at the snapped point projected to screen space', () => {
    const recorder = recordingContext()
    const viewport = { scale: DEFAULT_PLAN_SCALE }
    const snap: SnapResult = { point: { x: 1000, y: 0 }, kind: 'grid' }

    drawSnapIndicator(recorder.ctx, snap, viewport)

    const expected = worldToScreen(snap.point, viewport)
    expect(recorder.ops).toContain('arc')
    expect(recorder.arcs).toHaveLength(1)
    expect(recorder.arcs[0]?.x).toBe(expected.x)
    expect(recorder.arcs[0]?.y).toBe(expected.y)
  })
})

describe('drawPlan snap indicator', () => {
  it('paints the snap indicator after the walls but beneath the rulers', () => {
    const recorder = recordingContext()
    const snap: SnapResult = { point: { x: 1000, y: 0 }, kind: 'grid' }

    // No preview, so the snap indicator's ring is the only arc recorded.
    drawPlan(recorder.ctx, {
      walls: [sampleWall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 200,
      height: 200,
      selectedIds: new Set<string>(),
      rulers: true,
      snap,
    })

    const { ops } = recorder
    expect(recorder.arcs).toHaveLength(1)
    const snapArc = ops.indexOf('arc')
    // The snap indicator paints after every wall is stroked.
    expect(snapArc).toBeGreaterThan(ops.indexOf('lineTo'))
    // Rulers (their tick text) still paint last, above the snap indicator.
    expect(ops.indexOf('fillText')).toBeGreaterThan(snapArc)
  })

  it('paints no snap indicator when no snap is supplied', () => {
    const withSnap = recordingContext()
    const snap: SnapResult = { point: { x: 1000, y: 0 }, kind: 'grid' }
    drawPlan(withSnap.ctx, {
      walls: [sampleWall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 200,
      height: 200,
      selectedIds: new Set<string>(),
      snap,
    })

    const withoutSnap = recordingContext()
    drawPlan(withoutSnap.ctx, {
      walls: [sampleWall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 200,
      height: 200,
      selectedIds: new Set<string>(),
    })

    expect(withSnap.arcs).toHaveLength(1)
    expect(withoutSnap.arcs).toHaveLength(0)
  })
})
