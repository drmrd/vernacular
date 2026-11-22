import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup } from '@testing-library/react'

import type { OpenParts } from '../../core'

import { openPartsWith } from './open-parts-test-support'
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
    const openStored = openPartsWith({ [env.doorAId]: ['primary'], [env.doorBId]: ['primary'] })
    const { result, rerender } = renderMotion(env, { root, stored: openStored })
    tickOpeningMotion(root, result.current, FULL_STEP)
    expect(fillGroupPose(root, env.doorBId)).not.toEqual(shutPoseB)

    rerender({ root, stored: new Map() })
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
    const openStored = openPartsWith({ [env.doorAId]: ['primary'], [env.doorBId]: ['primary'] })
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

describe('useOpeningMotion when the shown list changes and the root stays', () => {
  it('keeps a door part way through its swing when the shown list changes and the root stays', () => {
    const env = twoFloorEnvironment('building')
    const shutPoseA = shutPoseOf(env, env.doorAId)
    const root = env.buildRoot()
    const stored = openPartsWith({ [env.doorAId]: ['primary'] })
    const { result, rerender } = renderMotion(env, { root, stored: new Map() })
    rerender({ root, stored })
    tickOpeningMotion(root, result.current, FULL_STEP / 10)
    const midPose = fillGroupPose(root, env.doorAId)
    const midOpenness = result.current.openness.current.get(env.doorAId)?.primary
    expect(midPose).not.toEqual(shutPoseA)
    expect(midOpenness).toBeGreaterThan(0)
    expect(midOpenness).toBeLessThan(1)
    const shownBefore = result.current.shownOpenings.current

    act(() => env.activeFloor.setActiveFloorId(FLOOR_B_ID))
    rerender({ root, stored })

    // The change of the active floor gives the hook a new shown list that still holds door A.
    const shownAfter = result.current.shownOpenings.current
    expect(shownAfter).not.toBe(shownBefore)
    expect(shownAfter.map((opening) => opening.id)).toContain(env.doorAId)
    expect(fillGroupPose(root, env.doorAId)).toEqual(midPose)
    expect(result.current.openness.current.get(env.doorAId)?.primary).toBe(midOpenness)
  })
})

// Floor B is active with door B held open and ticked open on root B. The user then shows floor A
// and either empties the stored set or keeps it, and comes back to floor B with the same root B.
function leaveAndReturnToFloorB(env: TwoFloorEnvironment, storedWhileAway: OpenParts) {
  env.activeFloor.setActiveFloorId(FLOOR_B_ID)
  const rootB = env.buildRoot()
  seatDoorOpenOnRoot(env, rootB, { floorId: FLOOR_B_ID, doorId: env.doorBId })
  const openStored = openPartsWith({ [env.doorBId]: ['primary'] })
  const { result, rerender } = renderMotion(env, { root: rootB, stored: openStored })
  tickOpeningMotion(rootB, result.current, FULL_STEP)
  const openPoseB = fillGroupPose(rootB, env.doorBId)

  act(() => env.activeFloor.setActiveFloorId(FLOOR_A_ID))
  const rootA = env.buildRoot()
  rerender({ root: rootA, stored: openStored })
  rerender({ root: rootA, stored: storedWhileAway })

  act(() => env.activeFloor.setActiveFloorId(FLOOR_B_ID))
  rerender({ root: rootB, stored: storedWhileAway })
  return { rootB, openPoseB, result }
}

describe('useOpeningMotion in the floor view across a return to a floor', () => {
  it('shows a door reset while its floor was not shown as shut on the return, before any tick', () => {
    const env = twoFloorEnvironment('floor')
    env.activeFloor.setActiveFloorId(FLOOR_B_ID)
    const shutPoseB = shutPoseOf(env, env.doorBId)

    const { rootB, openPoseB, result } = leaveAndReturnToFloorB(env, new Map())

    expect(openPoseB).not.toEqual(shutPoseB)
    expect(fillGroupPose(rootB, env.doorBId)).toEqual(shutPoseB)
    tickOpeningMotion(rootB, result.current, FULL_STEP)
    expect(fillGroupPose(rootB, env.doorBId)).toEqual(shutPoseB)
  })

  it('shows a door still held open as open on the return, before any tick', () => {
    const env = twoFloorEnvironment('floor')

    const { rootB, openPoseB } = leaveAndReturnToFloorB(
      env,
      openPartsWith({ [env.doorBId]: ['primary'] }),
    )

    expect(fillGroupPose(rootB, env.doorBId)).toEqual(openPoseB)
  })
})

describe('useOpeningMotion when the scope or the shown floors change', () => {
  it('shows a door reset in the floor view as shut when the view switches to the whole building', () => {
    const env = twoFloorEnvironment('floor')
    act(() => env.activeFloor.setActiveFloorId(FLOOR_B_ID))
    const shutPoseB = shutPoseOf(env, env.doorBId)
    const rootB = env.buildRoot()
    const openStored = openPartsWith({ [env.doorBId]: ['primary'] })
    const { result, rerender } = renderMotion(env, { root: rootB, stored: openStored })
    tickOpeningMotion(rootB, result.current, FULL_STEP)
    act(() => env.activeFloor.setActiveFloorId(FLOOR_A_ID))
    const rootA = env.buildRoot()
    rerender({ root: rootA, stored: openStored })
    rerender({ root: rootA, stored: new Map() })
    act(() => env.sceneSession.updateSceneSession({ scope: 'building' }))

    // The new shown list can reach the hook before the new root does, as across the canvas boundary.
    rerender({ root: rootA, stored: new Map() })
    expect(() => tickOpeningMotion(rootA, result.current, FULL_STEP / 10)).not.toThrow()
    const building = env.buildRoot()
    rerender({ root: building, stored: new Map() })

    expect(fillGroupPose(building, env.doorBId)).toEqual(shutPoseB)
  })

  it('seats a door that leaves the view part way through its swing at its target, so it shows there with no swing when its floor returns', () => {
    const env = twoFloorEnvironment('floor')
    env.activeFloor.setActiveFloorId(FLOOR_B_ID)
    const openRoot = env.buildRoot()
    seatDoorOpenOnRoot(env, openRoot, { floorId: FLOOR_B_ID, doorId: env.doorBId })
    const openPoseB = fillGroupPose(openRoot, env.doorBId)
    const rootB = env.buildRoot()
    const stored = openPartsWith({ [env.doorBId]: ['primary'] })
    const { result, rerender } = renderMotion(env, { root: rootB, stored: new Map() })
    rerender({ root: rootB, stored })
    tickOpeningMotion(rootB, result.current, FULL_STEP / 10)
    const midOpenness = result.current.openness.current.get(env.doorBId)?.primary
    expect(midOpenness).toBeGreaterThan(0)
    expect(midOpenness).toBeLessThan(1)

    act(() => env.activeFloor.setActiveFloorId(FLOOR_A_ID))
    rerender({ root: env.buildRoot(), stored })
    act(() => env.activeFloor.setActiveFloorId(FLOOR_B_ID))
    rerender({ root: rootB, stored })

    expect(fillGroupPose(rootB, env.doorBId)).toEqual(openPoseB)
    expect(result.current.openness.current.get(env.doorBId)?.primary).toBe(1)
  })
})
