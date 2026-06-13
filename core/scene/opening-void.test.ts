import { describe, it, expect } from 'vitest'
import type { Contour } from './contour'
import type { OpeningSceneNode } from './scene-graph'
import { rectangularVoidContour } from './opening-void'

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
