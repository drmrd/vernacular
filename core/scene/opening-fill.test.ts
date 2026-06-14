import { describe, it, expect } from 'vitest'
import type { OpeningSceneNode } from './scene-graph'
import { openingFill, LEAF_REVEAL_GAP_MM, DOOR_LEAF_THICKNESS_MM } from './opening-fill'

describe('openingFill', () => {
  it('fills a single door with one reveal-inset leaf at the door-leaf thickness', () => {
    const doorNode: OpeningSceneNode = {
      id: 'opening-1',
      kind: 'opening',
      floorId: 'floor-1',
      type: 'single-swing-door',
      center: { x: 1000, y: 0 },
      along: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      width: 900,
      height: 2032,
      sillHeight: 0,
      hostThickness: 120,
      orientation: { hinge: 'start', facing: 'positive' },
      hostWallId: 'south',
    }

    const parts = openingFill(doorNode)

    expect(parts).toEqual([
      {
        role: 'leaf',
        along: { min: -450 + LEAF_REVEAL_GAP_MM, max: 450 - LEAF_REVEAL_GAP_MM },
        up: { min: LEAF_REVEAL_GAP_MM, max: 2032 - LEAF_REVEAL_GAP_MM },
        thickness: DOOR_LEAF_THICKNESS_MM,
      },
    ])
  })
})
