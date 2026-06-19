import { describe, it, expect } from 'vitest'
import {
  roleMaterialParameters,
  FURNITURE_COLOR,
  FURNITURE_OPACITY,
  FURNITURE_FAILED_COLOR,
  FURNITURE_FAILED_OPACITY,
  NEUTRAL_COLOR,
} from './role-appearance'
import type { SurfaceRole } from './material-provider'

describe('roleMaterialParameters', () => {
  it('pushes the slab-top role back in depth so the coincident wall base wins', () => {
    const top = roleMaterialParameters('top')

    expect(top.polygonOffset).toBe(true)
    expect(top.polygonOffsetFactor).toBeGreaterThan(0)
    expect(top.polygonOffsetUnits).toBeGreaterThan(0)
  })

  it('resolves the furniture role to a distinct red, semi-transparent appearance', () => {
    const furniture = roleMaterialParameters('furniture')

    expect(furniture.color).toBe(FURNITURE_COLOR)
    expect(furniture.color).not.toBe(NEUTRAL_COLOR)
    expect(furniture.transparent).toBe(true)
    expect(furniture.opacity).toBe(FURNITURE_OPACITY)
    expect(furniture.name).toBe('furniture')
  })

  it('resolves the failed-furniture role to a distinct, non-red, semi-transparent appearance', () => {
    const failed = roleMaterialParameters('furnitureFailed' as SurfaceRole)

    expect(failed.color).toBe(FURNITURE_FAILED_COLOR)
    expect(failed.color).not.toBe(FURNITURE_COLOR)
    expect(failed.color).not.toBe(NEUTRAL_COLOR)
    expect(failed.transparent).toBe(true)
    expect(failed.opacity).toBe(FURNITURE_FAILED_OPACITY)
    expect(failed.name).toBe('furnitureFailed')
  })
})
