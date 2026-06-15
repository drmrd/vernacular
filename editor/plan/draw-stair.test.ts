import { describe, it, expect } from 'vitest'
import { drawStair } from './draw-stair'
import { recordingContext } from './draw-plan-test-fixtures'
import { DEFAULT_PLAN_PALETTE } from './plan-palette'
import type { Viewport } from './viewport'
import type { StairSceneNode } from '../../core'

// A non-trivial scale and pan so the projection is observable rather than an
// identity map, mirroring the underlay and opening draw tests.
const VIEWPORT: Viewport = { scale: 0.05, offset: { x: 31, y: 47 } }
const RENDER = { viewport: VIEWPORT, palette: DEFAULT_PLAN_PALETTE }

// A straight stair: a 1000 by 3000 mm footprint anchored at the world origin,
// connecting floor f1 to the well opening on floor f2, with no rotation.
const node: StairSceneNode = {
  id: 'stair:s1',
  kind: 'stair',
  floorId: 'f1',
  wellFloorId: 'f2',
  runType: 'straight',
  position: { x: 0, y: 0 },
  width: 1000,
  length: 3000,
  rotation: 0,
}

function countOp(ops: readonly string[], name: string): number {
  return ops.filter((op) => op === name).length
}

describe('drawStair', () => {
  it('strokes the footprint outline and starts at least one run line through the viewport', () => {
    const recorder = recordingContext()

    drawStair(recorder.ctx, node, RENDER)

    // The footprint outline is stroked at least once.
    expect(countOp(recorder.ops, 'stroke')).toBeGreaterThanOrEqual(1)
    // At least one path is started for the outline or a tread/arrow run line.
    expect(countOp(recorder.ops, 'moveTo')).toBeGreaterThanOrEqual(1)
  })
})
