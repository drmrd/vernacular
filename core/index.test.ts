import { describe, expect, it } from 'vitest'
import {
  builtinPeriods,
  builtinRoomPurposes,
  builtinStyles,
  resolvePeriod,
  resolveStyle,
  setFloorPeriod,
  setFloorStyle,
  setProjectPeriod,
  setProjectStyle,
  setRoomPeriod,
  setRoomPurpose,
  setRoomStyle,
  setRoomSubPurpose,
} from './index'

describe('core barrel', () => {
  it('re-exports the period, style, and room-purpose vocabulary', () => {
    expect(builtinPeriods.version).toBeGreaterThan(0)
    expect(builtinStyles.version).toBeGreaterThan(0)
    expect(builtinRoomPurposes.version).toBeGreaterThan(0)
    for (const fn of [
      resolvePeriod,
      resolveStyle,
      setProjectPeriod,
      setProjectStyle,
      setFloorPeriod,
      setFloorStyle,
      setRoomPurpose,
      setRoomSubPurpose,
      setRoomPeriod,
      setRoomStyle,
    ]) {
      expect(typeof fn).toBe('function')
    }
  })
})
