import { describe, it, expect } from 'vitest'
import { SNAP_PIXEL_TOLERANCE } from './snap'
import {
  DEFAULT_SNAP_PREFERENCES,
  setSnapEnabled,
  setSnapPixelRadius,
  toggleSnapKind,
} from './snap-preferences'
import { buildSnapContext } from './use-snapping'

const baseInputs = { walls: [], viewport: { scale: 2 }, origin: undefined }

describe('buildSnapContext', () => {
  it('derives the world tolerance from the preference radius and the zoom', () => {
    const context = buildSnapContext(baseInputs, DEFAULT_SNAP_PREFERENCES)
    expect(context.toleranceMm).toBe(SNAP_PIXEL_TOLERANCE / 2)
  })

  it('uses a custom radius preference for the tolerance', () => {
    const context = buildSnapContext(
      { walls: [], viewport: { scale: 1 }, origin: undefined },
      setSnapPixelRadius(DEFAULT_SNAP_PREFERENCES, 24),
    )
    expect(context.toleranceMm).toBe(24)
  })

  it('passes the master flag through and disables underlay-corner tracing by default', () => {
    const context = buildSnapContext(baseInputs, DEFAULT_SNAP_PREFERENCES)
    expect(context.enabled).toBe(true)
    expect([...(context.disabledKinds ?? [])]).toEqual(['trace'])
  })

  it('turns the master off when the preference is off', () => {
    const context = buildSnapContext(baseInputs, setSnapEnabled(DEFAULT_SNAP_PREFERENCES, false))
    expect(context.enabled).toBe(false)
  })

  it('marks a toggled-off kind as disabled', () => {
    const context = buildSnapContext(baseInputs, toggleSnapKind(DEFAULT_SNAP_PREFERENCES, 'grid'))
    expect(context.disabledKinds?.has('grid')).toBe(true)
    expect(context.disabledKinds?.has('endpoint')).toBe(false)
  })
})
