import { describe, expect, it } from 'vitest'
import { openingHeadArcs } from './opening-head'

const WIDTH_MM = 900
const HALF_WIDTH_MM = WIDTH_MM / 2

describe('openingHeadArcs', () => {
  it('resolves a round head as one semicircle springing from the jambs', () => {
    const arcs = openingHeadArcs('round', WIDTH_MM)

    expect(arcs).toHaveLength(1)
    const [arc] = arcs
    expect(arc).toBeDefined()
    if (arc === undefined) return
    // The semicircle is centered on the springline midpoint, springs from the two
    // jambs, and rises a half-width to its crown.
    expect(arc.center).toEqual({ x: 0, y: 0 })
    expect(arc.from).toEqual({ x: -HALF_WIDTH_MM, y: 0 })
    expect(arc.to).toEqual({ x: HALF_WIDTH_MM, y: 0 })
    expect(arc.crown).toEqual({ x: 0, y: HALF_WIDTH_MM })
  })

  it('resolves an arched head as one shallow segmental arc below a semicircle', () => {
    const arcs = openingHeadArcs('arched', WIDTH_MM)

    expect(arcs).toHaveLength(1)
    const [arc] = arcs
    expect(arc).toBeDefined()
    if (arc === undefined) return
    // The arc springs from the two jambs.
    expect(arc.from).toEqual({ x: -HALF_WIDTH_MM, y: 0 })
    expect(arc.to).toEqual({ x: HALF_WIDTH_MM, y: 0 })
    // Its crown sits on the centerline, rising less than a semicircle would.
    expect(arc.crown.x).toBe(0)
    expect(arc.crown.y).toBeGreaterThan(0)
    expect(arc.crown.y).toBeLessThan(HALF_WIDTH_MM)
    // A segmental arch is part of a larger circle, so its center drops below the springline.
    expect(arc.center.x).toBe(0)
    expect(arc.center.y).toBeLessThan(0)
    // A genuine circular arc: the jambs and the crown are equidistant from the center.
    const radius = (p: { x: number; y: number }): number =>
      Math.hypot(p.x - arc.center.x, p.y - arc.center.y)
    expect(radius(arc.from)).toBeCloseTo(radius(arc.crown))
    expect(radius(arc.to)).toBeCloseTo(radius(arc.crown))
  })
})
