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
})
