import { describe, it, expect } from 'vitest'
import { swingLeafGeometry } from './opening-geometry'
import type { OpeningSceneNode } from '../../core'

// A horizontal opening matching the draw-opening test fixture: center off the
// origin, leaf running along +x, the host-wall left-hand normal pointing +y, a
// residential door width, and a typical interior-wall thickness. The default
// orientation hinges on the start jamb and opens toward the +y (positive)
// facing side.
const OPENING_CENTER_X_MM = 1000
const OPENING_WIDTH_MM = 800
const OPENING_HEIGHT_MM = 2032
const OPENING_SILL_HEIGHT_MM = 0
const HOST_THICKNESS_MM = 114

function openingNode(overrides: Partial<OpeningSceneNode> = {}): OpeningSceneNode {
  return {
    id: 'opening:a',
    kind: 'opening',
    floorId: 'f',
    type: 'single-swing-door',
    center: { x: OPENING_CENTER_X_MM, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: OPENING_WIDTH_MM,
    height: OPENING_HEIGHT_MM,
    sillHeight: OPENING_SILL_HEIGHT_MM,
    hostThickness: HOST_THICKNESS_MM,
    orientation: { hinge: 'start', facing: 'positive' },
    ...overrides,
  }
}

describe('swingLeafGeometry', () => {
  it('reports the hinge, open leaf end, closed jamb, and minor-arc sweep for the default door', () => {
    const geometry = swingLeafGeometry(openingNode())

    // The pivot jamb is the start jamb (center - along * width / 2).
    expect(geometry.hinge).toEqual({ x: 600, y: 0 })
    // The open leaf tip is one width along the +y facing normal from the hinge.
    expect(geometry.leafEnd).toEqual({ x: 600, y: 800 })
    // The arc sweeps toward the opposite (end) jamb.
    expect(geometry.closed).toEqual({ x: 1400, y: 0 })
    // After the screen y-flip this minor (quarter-circle) arc sweeps clockwise.
    expect(geometry.counterclockwise).toBe(false)
  })

  it('hinges on the start jamb facing positive and sweeps the minor (quarter-circle) arc', () => {
    const geometry = swingLeafGeometry(
      openingNode({ orientation: { hinge: 'start', facing: 'positive' } }),
    )

    expect(geometry.hinge).toEqual({ x: 600, y: 0 })
    expect(geometry.leafEnd).toEqual({ x: 600, y: 800 })
    expect(geometry.closed).toEqual({ x: 1400, y: 0 })
    expect(geometry.counterclockwise).toBe(false)
  })
})
