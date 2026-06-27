import { describe, expect, it } from 'vitest'
import type { OpeningSceneNode } from '../../core'
import { toDrawableOpenings } from './drawable-openings'

function openingNode(type: string): OpeningSceneNode {
  return {
    id: 'opening:a',
    kind: 'opening',
    floorId: 'f',
    type,
    center: { x: 0, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 700,
    height: 1400,
    sillHeight: 800,
    hostThickness: 114,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

describe('toDrawableOpenings', () => {
  it('resolves the head shape from the element type void contour', () => {
    const [drawable] = toDrawableOpenings([openingNode('round-top-window')], new Set())

    expect(drawable?.head).toBe('round')
  })
})
