import { describe, expect, it } from 'vitest'

import type { Point } from '../model/types'
import { nearWallFadeEngaged } from './near-wall-fade-engaged'

function point(x: number, y: number): Point {
  return { x, y }
}

// A single axis-aligned square room spanning (0,0)..(4000,4000) in plan mm.
const room: readonly Point[] = [point(0, 0), point(4000, 0), point(4000, 4000), point(0, 4000)]

describe('nearWallFadeEngaged', () => {
  it('runs the fade when enabled and the viewer stands outside the building', () => {
    expect(nearWallFadeEngaged(true, point(6000, 2000), [room])).toBe(true)
  })

  it('suppresses the fade when enabled but the viewer is already indoors', () => {
    expect(nearWallFadeEngaged(true, point(2000, 2000), [room])).toBe(false)
  })

  it('leaves the fade off when the view mode disables it, even outside the building', () => {
    expect(nearWallFadeEngaged(false, point(6000, 2000), [room])).toBe(false)
  })

  it('leaves the fade off when the view mode disables it and the viewer is indoors', () => {
    expect(nearWallFadeEngaged(false, point(2000, 2000), [room])).toBe(false)
  })

  it('runs the fade when enabled and there is no building footprint to be inside of', () => {
    expect(nearWallFadeEngaged(true, point(2000, 2000), [])).toBe(true)
  })

  it('suppresses the fade for a viewpoint exactly on a room edge (boundary counts as inside)', () => {
    expect(nearWallFadeEngaged(true, point(2000, 0), [room])).toBe(false)
  })
})
