import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup } from '@testing-library/react'

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
  type TwoFloorEnvironment,
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

  it('poses an open door of another shown floor on a newly built root before any tick', () => {
    const env = twoFloorEnvironment('building')
    const firstRoot = env.buildRoot()
    seatDoorOpenOnRoot(env, firstRoot, { floorId: FLOOR_A_ID, doorId: env.doorAId })
    seatDoorOpenOnRoot(env, firstRoot, { floorId: FLOOR_B_ID, doorId: env.doorBId })
    const openStored = new Set([env.doorAId, env.doorBId])
    const { result, rerender } = renderMotion(env, { root: firstRoot, stored: openStored })
    tickOpeningMotion(firstRoot, result.current, FULL_STEP)
    const openPoseA = fillGroupPose(firstRoot, env.doorAId)
    const openPoseB = fillGroupPose(firstRoot, env.doorBId)

    const rebuiltRoot = env.buildRoot()
    rerender({ root: rebuiltRoot, stored: openStored })

    // Floor A is active, so its door is the control: a new root already poses it open.
    expect(fillGroupPose(rebuiltRoot, env.doorAId)).toEqual(openPoseA)
    expect(fillGroupPose(rebuiltRoot, env.doorBId)).toEqual(openPoseB)
  })
})

// Floor B is active with door B held open and ticked open on root B. The user then shows floor A
// and either empties the stored set or keeps it, and comes back to floor B with the same root B.
function leaveAndReturnToFloorB(env: TwoFloorEnvironment, setAwayFromB: ReadonlySet<string>) {
  env.activeFloor.setActiveFloorId(FLOOR_B_ID)
  const rootB = env.buildRoot()
  seatDoorOpenOnRoot(env, rootB, { floorId: FLOOR_B_ID, doorId: env.doorBId })
  const openStored = new Set([env.doorBId])
  const { result, rerender } = renderMotion(env, { root: rootB, stored: openStored })
  tickOpeningMotion(rootB, result.current, FULL_STEP)
  const openPoseB = fillGroupPose(rootB, env.doorBId)

  act(() => env.activeFloor.setActiveFloorId(FLOOR_A_ID))
  const rootA = env.buildRoot()
  rerender({ root: rootA, stored: openStored })
  rerender({ root: rootA, stored: setAwayFromB })

  act(() => env.activeFloor.setActiveFloorId(FLOOR_B_ID))
  rerender({ root: rootB, stored: setAwayFromB })
  return { rootB, openPoseB }
}

describe('useOpeningMotion in the floor view across a return to a floor', () => {
  it('shows a door reset while its floor was not shown as shut on the return, before any tick', () => {
    const env = twoFloorEnvironment('floor')
    env.activeFloor.setActiveFloorId(FLOOR_B_ID)
    const shutPoseB = shutPoseOf(env, env.doorBId)

    const { rootB, openPoseB } = leaveAndReturnToFloorB(env, new Set())

    expect(openPoseB).not.toEqual(shutPoseB)
    expect(fillGroupPose(rootB, env.doorBId)).toEqual(shutPoseB)
  })

  it('shows a door still held open as open on the return, before any tick', () => {
    const env = twoFloorEnvironment('floor')

    const { rootB, openPoseB } = leaveAndReturnToFloorB(env, new Set([env.doorBId]))

    expect(fillGroupPose(rootB, env.doorBId)).toEqual(openPoseB)
  })
})
