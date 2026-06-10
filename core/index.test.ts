import { describe, expect, it } from 'vitest'
import {
  addObstruction,
  addPaletteColor,
  assignSurfacePaint,
  builtinPalettes,
  builtinPeriods,
  builtinRoomPurposes,
  builtinStyles,
  clearSurfacePaint,
  colorFromHex,
  createProjectPalette,
  mixColors,
  nearestColor,
  resolvePeriod,
  resolveStyle,
  resolveSurfacePaint,
  setFloorPeriod,
  setFloorStyle,
  setProjectPeriod,
  setProjectStyle,
  setRoomPeriod,
  setRoomPurpose,
  setRoomStyle,
  setRoomSubPurpose,
  setSiteLocation,
  srgbToOkLab,
  surfaceKey,
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

describe('core barrel', () => {
  it('re-exports the color, palette, paint, and site surface', () => {
    expect(builtinPalettes.version).toBeGreaterThan(0)
    for (const fn of [
      colorFromHex,
      srgbToOkLab,
      mixColors,
      nearestColor,
      surfaceKey,
      resolveSurfacePaint,
      assignSurfacePaint,
      clearSurfacePaint,
      createProjectPalette,
      addPaletteColor,
      setSiteLocation,
      addObstruction,
    ]) {
      expect(typeof fn).toBe('function')
    }
  })
})
