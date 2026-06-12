import { describe, it, expect } from 'vitest'
import { SNAP_PIXEL_TOLERANCE } from './snap'
import {
  DEFAULT_SNAP_PREFERENCES,
  isSnapKindEnabled,
  setSnapEnabled,
  setSnapPixelRadius,
  toggleSnapKind,
  type SnapPreferences,
  type TogglableSnapKind,
} from './snap-preferences'

/** The eight running snap kinds the preferences govern (everything except the draw-aid trace). */
const RUNNING_SNAP_KINDS: readonly TogglableSnapKind[] = [
  'endpoint',
  'intersection',
  'midpoint',
  'edge',
  'angle',
  'perpendicular',
  'parallel',
  'grid',
]

describe('default snap preferences', () => {
  it('enables the master so a user who never opens the panel still snaps', () => {
    expect(DEFAULT_SNAP_PREFERENCES.enabled).toBe(true)
  })

  it('enables every running snap kind to preserve the out-of-the-box behavior', () => {
    for (const kind of RUNNING_SNAP_KINDS) {
      expect(DEFAULT_SNAP_PREFERENCES.kinds[kind]).toBe(true)
    }
  })

  it('does not treat the draw-aid trace as a togglable running kind', () => {
    expect(DEFAULT_SNAP_PREFERENCES.kinds).not.toHaveProperty('trace')
  })

  it('defaults the catch radius to the current pixel tolerance', () => {
    expect(DEFAULT_SNAP_PREFERENCES.pixelRadius).toBe(SNAP_PIXEL_TOLERANCE)
  })
})

describe('toggleSnapKind', () => {
  it('flips the targeted kind off when it was on', () => {
    const next = toggleSnapKind(DEFAULT_SNAP_PREFERENCES, 'grid')

    expect(next.kinds.grid).toBe(false)
  })

  it('flips the targeted kind back on when it was off', () => {
    const off = toggleSnapKind(DEFAULT_SNAP_PREFERENCES, 'grid')

    const back = toggleSnapKind(off, 'grid')

    expect(back.kinds.grid).toBe(true)
  })

  it('leaves the other kinds unchanged', () => {
    const next = toggleSnapKind(DEFAULT_SNAP_PREFERENCES, 'grid')

    for (const kind of RUNNING_SNAP_KINDS) {
      if (kind !== 'grid') {
        expect(next.kinds[kind]).toBe(true)
      }
    }
  })

  it('returns a new value and does not mutate the input', () => {
    const before: SnapPreferences = DEFAULT_SNAP_PREFERENCES

    const next = toggleSnapKind(before, 'angle')

    expect(next).not.toBe(before)
    expect(before.kinds.angle).toBe(true)
  })
})

describe('setSnapEnabled', () => {
  it('turns the master off', () => {
    const next = setSnapEnabled(DEFAULT_SNAP_PREFERENCES, false)

    expect(next.enabled).toBe(false)
  })

  it('returns a new value and does not mutate the input', () => {
    const before = DEFAULT_SNAP_PREFERENCES

    const next = setSnapEnabled(before, false)

    expect(next).not.toBe(before)
    expect(before.enabled).toBe(true)
  })
})

describe('setSnapPixelRadius', () => {
  it('sets a positive radius', () => {
    const next = setSnapPixelRadius(DEFAULT_SNAP_PREFERENCES, 24)

    expect(next.pixelRadius).toBe(24)
  })

  it('clamps a zero radius up so the catch radius never collapses', () => {
    const next = setSnapPixelRadius(DEFAULT_SNAP_PREFERENCES, 0)

    expect(next.pixelRadius).toBeGreaterThanOrEqual(1)
  })

  it('clamps a negative radius up so the catch radius never collapses', () => {
    const next = setSnapPixelRadius(DEFAULT_SNAP_PREFERENCES, -10)

    expect(next.pixelRadius).toBeGreaterThanOrEqual(1)
  })

  it('returns a new value and does not mutate the input', () => {
    const before = DEFAULT_SNAP_PREFERENCES

    const next = setSnapPixelRadius(before, 24)

    expect(next).not.toBe(before)
    expect(before.pixelRadius).toBe(SNAP_PIXEL_TOLERANCE)
  })
})

describe('isSnapKindEnabled', () => {
  it('reports a kind as enabled on the defaults', () => {
    expect(isSnapKindEnabled(DEFAULT_SNAP_PREFERENCES, 'midpoint')).toBe(true)
  })

  it('reports a kind as disabled after it is toggled off, independent of the master', () => {
    const next = toggleSnapKind(DEFAULT_SNAP_PREFERENCES, 'midpoint')

    expect(isSnapKindEnabled(next, 'midpoint')).toBe(false)
  })
})
