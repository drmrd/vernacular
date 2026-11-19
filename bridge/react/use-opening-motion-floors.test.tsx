import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'

import { tickOpeningMotion } from './use-opening-motion'
import {
  FLOOR_A_ID,
  FLOOR_B_ID,
  FULL_STEP,
  fillGroupPose,
  renderMotion,
  seatDoorOpenOnRoot,
  shutPoseOf,
  twoFloorEnvironment,
} from './use-opening-motion-floors-test-support'

afterEach(cleanup)

describe('useOpeningMotion in the whole-building view', () => {
  it('swings a door on another shown floor shut once the stored set is emptied', () => {
    const env = twoFloorEnvironment('building')
    const shutPoseA = shutPoseOf(env, env.doorAId)
    const shutPoseB = shutPoseOf(env, env.doorBId)
    const root = env.buildRoot()
    seatDoorOpenOnRoot(env, root, { floorId: FLOOR_A_ID, doorId: env.doorAId })
    seatDoorOpenOnRoot(env, root, { floorId: FLOOR_B_ID, doorId: env.doorBId })
    const openStored = new Set([env.doorAId, env.doorBId])
    const { result, rerender } = renderMotion(env, { root, stored: openStored })
    tickOpeningMotion(root, result.current, FULL_STEP)
    expect(fillGroupPose(root, env.doorBId)).not.toEqual(shutPoseB)

    rerender({ root, stored: new Set() })
    tickOpeningMotion(root, result.current, FULL_STEP)

    // Floor A is active, so its door is the control: it follows the stored set in this fixture.
    expect(fillGroupPose(root, env.doorAId)).toEqual(shutPoseA)
    expect(fillGroupPose(root, env.doorBId)).toEqual(shutPoseB)
    // The interact key stays on the active floor.
    expect(result.current.openings.current.map((opening) => opening.id)).toEqual([env.doorAId])
  })
})
