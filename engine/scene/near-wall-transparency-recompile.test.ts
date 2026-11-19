import { describe, it, expect } from 'vitest'
import { restoreNearWallTransparency, updateNearWallTransparency } from './near-wall-transparency'
import {
  CAMERA_OUTSIDE,
  drawFlagsChanged,
  enrolledDoorRoomTargets,
  materialStatesOf,
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
