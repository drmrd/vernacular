import { describe, expect, it } from 'vitest'

import {
  advanceOpeningPose,
  openingPartMotion,
  openingPartTarget,
  openingTargetPose,
  settledPose,
  type OpeningPartId,
  type OpeningPose,
} from '../index'
import { openingNode, slideMotionOf } from './opening-motion-test-support'

const DOUBLE_HUNG = 'double-hung-window'
const SINGLE_HUNG = 'single-hung-window'
const DOOR = 'single-swing-door'
const PRECISION = 6

function parts(...ids: OpeningPartId[]): ReadonlySet<OpeningPartId> {
  return new Set(ids)
}

function travelAt(height: number, part: 'lower' | 'upper', open: ReadonlySet<OpeningPartId>) {
  const motion = slideMotionOf(
    openingPartMotion(DOUBLE_HUNG, openingNode(DOUBLE_HUNG, height), part),
  )
  const pose: OpeningPose = openingTargetPose(DOUBLE_HUNG, open)
  return motion.travel.y * (pose[part] ?? 0)
}

describe('openingTargetPose', () => {
  it('targets every part shut when nothing is open', () => {
    expect(openingTargetPose(DOUBLE_HUNG, undefined)).toEqual({ lower: 0, upper: 0 })
    expect(openingTargetPose(SINGLE_HUNG, undefined)).toEqual({ lower: 0 })
    expect(openingTargetPose(DOOR, undefined)).toEqual({ primary: 0 })
  })

  it('targets a full rise for the one sash that is open', () => {
    expect(openingTargetPose(DOUBLE_HUNG, parts('lower'))).toEqual({ lower: 1, upper: 0 })
    expect(openingTargetPose(DOUBLE_HUNG, parts('upper'))).toEqual({ lower: 0, upper: 1 })
    expect(openingTargetPose(SINGLE_HUNG, parts('lower'))).toEqual({ lower: 1 })
  })

  it('targets half travel on each sash when both are open', () => {
    expect(openingTargetPose(DOUBLE_HUNG, parts('lower', 'upper'))).toEqual({
      lower: 0.5,
      upper: 0.5,
    })
    expect(openingPartTarget(parts('lower', 'upper'), 'lower')).toBe(0.5)
    expect(openingPartTarget(undefined, 'upper')).toBe(0)
  })

  it('targets the primary part of a door open or shut', () => {
    expect(openingTargetPose(DOOR, parts('primary'))).toEqual({ primary: 1 })
    expect(openingTargetPose(DOOR, undefined)).toEqual({ primary: 0 })
  })

  it('gives each sash a travel that depends on the height and on which sashes are open', () => {
    const both = parts('lower', 'upper')

    expect(travelAt(1200, 'lower', parts('lower'))).toBeCloseTo(570, PRECISION)
    expect(travelAt(1200, 'lower', both)).toBeCloseTo(285, PRECISION)
    expect(travelAt(1200, 'upper', parts('upper'))).toBeCloseTo(-570, PRECISION)
    expect(travelAt(1200, 'upper', both)).toBeCloseTo(-285, PRECISION)
    expect(travelAt(2000, 'lower', both)).toBeCloseTo(485, PRECISION)
    expect(travelAt(2000, 'upper', both)).toBeCloseTo(-485, PRECISION)
    expect(travelAt(50, 'lower', both)).toBe(0)
    expect(travelAt(50, 'upper', both)).toBe(0)
  })
})

describe('advanceOpeningPose', () => {
  it('eases each part toward its own target at the openness rate', () => {
    const target = { lower: 0.5, upper: 0.5 }

    const partway = advanceOpeningPose({ lower: 1, upper: 0 }, target, 0.05)

    expect(partway.lower).toBeCloseTo(0.8, PRECISION)
    expect(partway.upper).toBeCloseTo(0.2, PRECISION)
  })

  it('reaches the target exactly and stops there', () => {
    const target = { lower: 0.5, upper: 0.5 }

    expect(advanceOpeningPose({ lower: 1, upper: 0 }, target, 1)).toEqual(target)
  })

  it('treats a part missing from the pose as shut', () => {
    expect(advanceOpeningPose({}, { primary: 1 }, 0.1).primary).toBeCloseTo(0.4, PRECISION)
  })

  it('returns the same pose when every part is at its target', () => {
    const pose = { lower: 0.5, upper: 0.5 }
    const empty = {}

    expect(advanceOpeningPose(pose, { lower: 0.5, upper: 0.5 }, 0.1)).toBe(pose)
    expect(advanceOpeningPose(empty, { lower: 0, upper: 0 }, 0.1)).toBe(empty)
  })
})

describe('settledPose', () => {
  it('settles every part named in the pose or open, without the opening type', () => {
    expect(settledPose({ lower: 0.3 }, parts('lower', 'upper'))).toEqual({
      lower: 0.5,
      upper: 0.5,
    })
    expect(settledPose({ primary: 0.4 }, undefined)).toEqual({ primary: 0 })
    expect(settledPose({ lower: 0.7, upper: 0.2 }, parts('upper'))).toEqual({
      lower: 0,
      upper: 1,
    })
  })
})
