import { describe, it, expect } from 'vitest'
import type { Contour } from './contour'
import type { Point } from '../model/types'
import { openingHeadArcs } from './opening-head'
import type { OpeningSceneNode } from './scene-graph'
import { openingVoidContour, rectangularVoidContour } from './opening-void'

/**
 * Builds a minimal valid OpeningSceneNode literal. Only `width`, `height`, and
 * `sillHeight` drive the void contour; the remaining required fields take simple
 * placeholder values, and the optional `hostWallId` is omitted.
 */
function openingNode(
  size: Pick<OpeningSceneNode, 'width' | 'height' | 'sillHeight'>,
): OpeningSceneNode {
  return {
    id: 'opening-1',
    kind: 'opening',
    floorId: 'floor-1',
    type: 'door',
    center: { x: 0, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: size.width,
    height: size.height,
    sillHeight: size.sillHeight,
    hostThickness: 100,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

describe('rectangularVoidContour', () => {
  it('authors a door void in the opening local frame, wound as a hole from the bottom-left corner', () => {
    const door = openingNode({ width: 800, height: 2032, sillHeight: 0 })

    const expected: Contour = {
      start: { x: -400, y: 0 },
      segments: [
        { kind: 'line', to: { x: -400, y: 2032 } },
        { kind: 'line', to: { x: 400, y: 2032 } },
        { kind: 'line', to: { x: 400, y: 0 } },
        { kind: 'line', to: { x: -400, y: 0 } },
      ],
    }

    expect(rectangularVoidContour(door)).toEqual(expected)
  })

  it('lifts a window void to its sill height in the opening local frame', () => {
    const window = openingNode({ width: 900, height: 1200, sillHeight: 900 })

    const expected: Contour = {
      start: { x: -450, y: 900 },
      segments: [
        { kind: 'line', to: { x: -450, y: 2100 } },
        { kind: 'line', to: { x: 450, y: 2100 } },
        { kind: 'line', to: { x: 450, y: 900 } },
        { kind: 'line', to: { x: -450, y: 900 } },
      ],
    }

    expect(rectangularVoidContour(window)).toEqual(expected)
  })
})

describe('openingVoidContour', () => {
  it('resolves a registered opening type to the rectangular void contour', () => {
    const door: OpeningSceneNode = {
      ...openingNode({ width: 800, height: 2032, sillHeight: 0 }),
      type: 'single-swing-door',
    }

    expect(openingVoidContour(door)).toEqual(rectangularVoidContour(door))
  })

  it('falls back to the rectangular void contour for an unregistered opening type', () => {
    const node: OpeningSceneNode = {
      ...openingNode({ width: 800, height: 2032, sillHeight: 0 }),
      type: 'no-such-type',
    }

    expect(openingVoidContour(node)).toEqual(rectangularVoidContour(node))
  })
})

/** A curved-head opening of `type`, sized so it resolves through the registry to that type's `voidContour`. */
function curvedOpening(
  type: string,
  size: Pick<OpeningSceneNode, 'width' | 'height' | 'sillHeight'>,
): OpeningSceneNode {
  return { ...openingNode(size), type }
}

describe('openingVoidContour curved heads', () => {
  it('cuts a round-top void with a semicircular arc springing from the jambs over the opening top', () => {
    const width = 900
    const height = 1500
    const sillHeight = 800
    const window = curvedOpening('round-top-window', { width, height, sillHeight })
    const [headArc] = openingHeadArcs('round', width)
    expect(headArc).toBeDefined()
    if (headArc === undefined) return
    const half = width / 2
    const topY = sillHeight + height
    const springY = topY - headArc.crown.y

    const contour = openingVoidContour(window)

    expect(contour.start).toEqual({ x: -half, y: sillHeight })
    expect(contour.segments[0]).toEqual({ kind: 'line', to: { x: -half, y: springY } })
    expect(contour.segments[1]).toEqual({
      kind: 'arc',
      to: { x: half, y: springY },
      center: { x: headArc.center.x, y: headArc.center.y + springY },
      clockwise: true,
    })
    expect(contour.segments[2]).toEqual({ kind: 'line', to: { x: half, y: sillHeight } })
    expect(contour.segments[3]).toEqual({ kind: 'line', to: { x: -half, y: sillHeight } })
  })

  it('cuts an arched void with a shallow segmental arc, its center dropped below the springline', () => {
    const width = 900
    const height = 1500
    const sillHeight = 800
    const window = curvedOpening('arched-window', { width, height, sillHeight })
    const [headArc] = openingHeadArcs('arched', width)
    expect(headArc).toBeDefined()
    if (headArc === undefined) return
    const half = width / 2
    const springY = sillHeight + height - headArc.crown.y

    const contour = openingVoidContour(window)

    expect(contour.segments[0]).toEqual({ kind: 'line', to: { x: -half, y: springY } })
    expect(contour.segments[1]).toEqual({
      kind: 'arc',
      to: { x: half, y: springY },
      center: { x: 0, y: headArc.center.y + springY },
      clockwise: true,
    })
    const arc = contour.segments[1] as { center: Point }
    expect(arc.center.y).toBeLessThan(springY)
  })

  it('cuts a lancet void with two arcs meeting at the apex at the opening top', () => {
    const width = 450
    const height = 1800
    const sillHeight = 700
    const window = curvedOpening('lancet-window', { width, height, sillHeight })
    const [leftHead] = openingHeadArcs('lancet', width)
    expect(leftHead).toBeDefined()
    if (leftHead === undefined) return
    const half = width / 2
    const topY = sillHeight + height
    const springY = topY - leftHead.to.y

    const contour = openingVoidContour(window)

    expect(contour.start).toEqual({ x: -half, y: sillHeight })
    expect(contour.segments[0]).toEqual({ kind: 'line', to: { x: -half, y: springY } })
    const arcs = contour.segments.filter((segment) => segment.kind === 'arc')
    expect(arcs).toHaveLength(2)
    expect(arcs[0]).toEqual({
      kind: 'arc',
      to: { x: 0, y: topY },
      center: { x: half, y: springY },
      clockwise: true,
    })
    expect(arcs[1]).toEqual({
      kind: 'arc',
      to: { x: half, y: springY },
      center: { x: -half, y: springY },
      clockwise: true,
    })
    expect(contour.segments.at(-2)).toEqual({ kind: 'line', to: { x: half, y: sillHeight } })
    expect(contour.segments.at(-1)).toEqual({ kind: 'line', to: { x: -half, y: sillHeight } })
  })
})
