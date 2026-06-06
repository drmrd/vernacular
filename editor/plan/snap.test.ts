import { describe, it, expect } from 'vitest'
import type { WallSceneNode } from '../../core'
import { snapPoint, type SnapContext } from './snap'

function wallNode(overrides: Partial<WallSceneNode> = {}): WallSceneNode {
  return {
    id: 'wall:a',
    kind: 'wall',
    floorId: 'g',
    start: { x: 1000, y: 1000 },
    end: { x: 5000, y: 1000 },
    thickness: 114,
    ...overrides,
  }
}

describe('snapPoint endpoint snapping', () => {
  it('snaps a cursor near a wall endpoint to that endpoint', () => {
    const wall = wallNode()
    // Grid spacing that does not coincide with the endpoint at (1000, 1000),
    // so the endpoint wins over any grid candidate.
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 70,
      toleranceMm: 50,
    }

    expect(snapPoint({ x: 1003, y: 998 }, context)).toEqual({
      point: { x: 1000, y: 1000 },
      kind: 'endpoint',
      referenceId: wall.id,
    })
  })

  it('snaps to the nearer endpoint when the cursor is near the wall end', () => {
    const wall = wallNode()
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 70,
      toleranceMm: 50,
    }

    expect(snapPoint({ x: 4996, y: 1002 }, context)).toEqual({
      point: { x: 5000, y: 1000 },
      kind: 'endpoint',
      referenceId: wall.id,
    })
  })
})
