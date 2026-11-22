import { describe, expect, it } from 'vitest'

import {
  openingPartMotion,
  openingPartTarget,
  openingTargetPose,
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
