import { describe, it, expect } from 'vitest'
import {
  restoreNearWallTransparency,
  restoreUnenrolledNearWallTargets,
  updateNearWallTransparency,
} from './near-wall-transparency'
import {
  CAMERA_INSIDE,
  CAMERA_OUTSIDE,
  CAMERA_OUTSIDE_CORNER,
  drawFlagsChanged,
  enrolledDoorRoomTargets,
  enrolledTargetsOf,
  materialStatesOf,
  roomWithWindowGraph,
  versionUnchanged,
  type MaterialState,
} from './near-wall-transparency-test-support'

describe('the near-wall fade marks a material whose transparency changes', () => {
  it('raises the version of each material the fade changes by exactly one', () => {
    const targets = enrolledDoorRoomTargets()
    const baseline = materialStatesOf(targets)

    updateNearWallTransparency(targets, CAMERA_OUTSIDE)

    const changed = baseline.filter(drawFlagsChanged)
    expect(changed.length).toBeGreaterThan(0)
    for (const before of changed) {
      expect(before.material.version).toBe(before.version + 1)
    }
  })

  it('raises the version of each material the restore changes by exactly one again', () => {
    const targets = enrolledDoorRoomTargets()
    updateNearWallTransparency(targets, CAMERA_OUTSIDE)
    const faded = materialStatesOf(targets)

    restoreNearWallTransparency(targets)

    const changed = faded.filter(drawFlagsChanged)
    expect(changed.length).toBeGreaterThan(0)
    for (const before of changed) {
      expect(before.material.version).toBe(before.version + 1)
    }
  })
})

describe('the near-wall fade leaves a material alone when its flags stay the same', () => {
  it('keeps every version when a second update runs from the same camera outside', () => {
    const targets = enrolledDoorRoomTargets()
    updateNearWallTransparency(targets, CAMERA_OUTSIDE)
    const faded = materialStatesOf(targets)

    updateNearWallTransparency(targets, CAMERA_OUTSIDE)

    expect(faded.length).toBeGreaterThan(0)
    expect(faded.every(versionUnchanged)).toBe(true)
  })

  it('keeps every version when an update from inside the room finds every target at baseline', () => {
    const targets = enrolledDoorRoomTargets()
    const baseline = materialStatesOf(targets)

    updateNearWallTransparency(targets, CAMERA_INSIDE)

    expect(baseline.length).toBeGreaterThan(0)
    expect(baseline.every(versionUnchanged)).toBe(true)
  })

  it('keeps every version when a restore finds every target at baseline', () => {
    const targets = enrolledDoorRoomTargets()
    const baseline = materialStatesOf(targets)

    restoreNearWallTransparency(targets)

    expect(baseline.length).toBeGreaterThan(0)
    expect(baseline.every(versionUnchanged)).toBe(true)
  })

  it('never changes the version of a window glass pane through a fade and a restore', () => {
    const targets = enrolledTargetsOf(roomWithWindowGraph())
    const baseline = materialStatesOf(targets)
    const isPane = (m: MaterialState): boolean => m.transparent && !m.depthWrite
    const panes = baseline.filter(isPane)
    const walls = baseline.filter((m) => !isPane(m))
    expect(panes.length).toBeGreaterThan(0)

    updateNearWallTransparency(targets, CAMERA_OUTSIDE)
    expect(walls.some((m) => m.material.transparent !== m.transparent)).toBe(true)
    expect(panes.every(versionUnchanged)).toBe(true)

    restoreNearWallTransparency(targets)
    expect(panes.every(versionUnchanged)).toBe(true)
  })
})

describe('the sweep of dropped near-wall targets marks only what it restores', () => {
  it('raises a dropped faded material by one and leaves a still-enrolled one alone', () => {
    const targets = enrolledTargetsOf(roomWithWindowGraph())
    const entries = targets.map((target) => ({ target, baseline: materialStatesOf([target]) }))
    updateNearWallTransparency(targets, CAMERA_OUTSIDE_CORNER)
    const faded = entries.filter((entry) => entry.baseline.some(drawFlagsChanged))
    expect(faded.length).toBeGreaterThanOrEqual(2)
    const [dropped, ...kept] = faded
    const stillEnrolled = kept.map((entry) => entry.target)
    const flipped = (dropped?.baseline ?? []).filter(drawFlagsChanged).map((b) => b.material)
    const droppedBefore = materialStatesOf(dropped ? [dropped.target] : []).filter((m) =>
      flipped.includes(m.material),
    )
    const keptBefore = materialStatesOf(stillEnrolled)

    restoreUnenrolledNearWallTargets(targets, stillEnrolled)

    expect(droppedBefore.length).toBeGreaterThan(0)
    for (const before of droppedBefore) {
      expect(before.material.version).toBe(before.version + 1)
    }
    expect(keptBefore.every(versionUnchanged)).toBe(true)
  })
})
