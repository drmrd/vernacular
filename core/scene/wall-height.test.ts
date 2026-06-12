import { describe, expect, it } from 'vitest'
import { createFloor, createWall } from '../model/factories'
import { deriveWallNode } from './scene-graph'
import { wallHeight } from './wall-height'

describe('wallHeight', () => {
  it("reports the host floor's default ceiling height for a wall node", () => {
    const floor = createFloor('Ground', { id: 'g', defaultCeilingHeight: 2700 })
    const node = deriveWallNode(floor, createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' }))

    expect(wallHeight(node)).toBe(2700)
  })
})
