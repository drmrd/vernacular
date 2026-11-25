import { describe, expect, it } from 'vitest'
import type { Wall } from '../model/types'
import { counterClockwiseWalls, pt, wall } from '../scene/opening-room-side-test-fixtures'
import { deriveFloorPlanGeometry } from './floor-plan-geometry'
import { faceOf, floorOf, SIDES } from './plan-geometry-test-support'

interface SetAsideCase {
  name: string
  walls: Wall[]
}

// The first case is a regression pin: a speck free of other walls gives the faces no edge to
// stretch along, so only the other two cases reach the loop-edge guard.
const setAsideCases: SetAsideCase[] = [
  {
    name: 'both ends within the join distance, free of other walls',
    walls: [...counterClockwiseWalls(), wall('speck', pt(2000, 1500), pt(2000.5, 1500))],
  },
  {
    name: 'both ends merged into the corner of two walls',
    walls: [...counterClockwiseWalls(), wall('speck', pt(-0.6, 0), pt(0.6, 0))],
  },
  {
    name: 'both ends merged into the junction of three walls',
    walls: [
      ...counterClockwiseWalls(),
      wall('speck', pt(-0.6, 0), pt(0.6, 0)),
      wall('stub', pt(0, 0), pt(-1500, -1500)),
    ],
  },
]

describe('the faces of a wall that the plan geometry sets aside as zero length', () => {
  it.each(setAsideCases)('has no stretch on either face ($name)', ({ walls }) => {
    const { network, setAside } = deriveFloorPlanGeometry(floorOf(walls))

    expect(setAside.zeroLengthWallIds).toContain('speck')
    for (const side of SIDES) {
      expect(faceOf(network, 'speck', side).stretches).toEqual([])
    }
  })
})
