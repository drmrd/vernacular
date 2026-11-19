import { describe, it, expect } from 'vitest'
import { SNAP_PIXEL_TOLERANCE } from './snap'
import {
  DEFAULT_SNAP_PREFERENCES,
  isSnapKindEnabled,
  setSnapEnabled,
  setSnapPixelRadius,
  SNAP_PREFERENCES_SETTING,
  TOGGLABLE_SNAP_KINDS,
  toggleSnapKind,
  type SnapPreferences,
  type TogglableSnapKind,
} from './snap-preferences'
import { storeHolding } from './snap-preferences-test-support'

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

  it('offers the underlay-corner trace as a togglable snap source', () => {
    expect(TOGGLABLE_SNAP_KINDS).toContain('trace')
  })

  it('leaves underlay-corner snapping off by default while its siblings stay on', () => {
    expect(DEFAULT_SNAP_PREFERENCES.kinds.trace).toBe(false)
    expect(DEFAULT_SNAP_PREFERENCES.kinds.endpoint).toBe(true)
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

/** Preferences that differ from the defaults in every field. */
const STORED_PREFERENCES: SnapPreferences = {
  enabled: false,
  kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false, angle: false, trace: true },
  pixelRadius: 24,
}

describe('the snap preferences setting', () => {
  const parse = (raw: unknown) => SNAP_PREFERENCES_SETTING.parse(raw)

  it('is named snapPreferences and defaults to the default preferences', () => {
    expect(SNAP_PREFERENCES_SETTING.name).toBe('snapPreferences')
    expect(SNAP_PREFERENCES_SETTING.defaultValue).toBe(DEFAULT_SNAP_PREFERENCES)
  })

  it('takes a whole stored value', () => {
    expect(parse(structuredClone(STORED_PREFERENCES))).toEqual(STORED_PREFERENCES)
  })

  it('fills missing fields from the defaults', () => {
    expect(parse({ enabled: false })).toEqual({ ...DEFAULT_SNAP_PREFERENCES, enabled: false })
  })

  it('fills a kind that is missing or not a boolean from its default', () => {
    const result = parse({ kinds: { grid: false, midpoint: 'off', trace: 1 } })

    expect(result?.kinds).toEqual({ ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false })
  })

  it('ignores a kind that this build does not know', () => {
    const result = parse({ kinds: { grid: false, kindFromANewerBuild: true } })

    expect(result?.kinds).toEqual({ ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false })
  })

  it('takes the default radius when the stored one is not a number', () => {
    const result = parse({ pixelRadius: '18' })

    expect(result?.pixelRadius).toBe(DEFAULT_SNAP_PREFERENCES.pixelRadius)
  })

  it('refuses a value that is not an object', () => {
    for (const raw of ['not an object', 18, true, null]) {
      expect(parse(raw)).toBeUndefined()
    }
  })

  it('reads an array as an object with no known field', () => {
    expect(parse([false, 18])).toEqual(DEFAULT_SNAP_PREFERENCES)
  })

  it('changes neither the stored object nor the defaults', () => {
    const stored = { enabled: false, kinds: { grid: false }, pixelRadius: 18 }
    const storedBefore = structuredClone(stored)
    const defaultsBefore = structuredClone(DEFAULT_SNAP_PREFERENCES)

    parse(stored)

    expect(stored).toEqual(storedBefore)
    expect(DEFAULT_SNAP_PREFERENCES).toEqual(defaultsBefore)
  })
})

/** The text of a radius that is too large for a number: JSON reads it as infinity. */
const OVERSIZED_RADIUS_TEXT = '{"pixelRadius":1e999}'

/** The value that JSON text gives, as a browser port would read it. */
function fromText(text: string): unknown {
  return JSON.parse(text)
}

describe('the snap preferences setting reading a stored value with an own __proto__ key', () => {
  it('at the top level changes nothing', () => {
    const withKey = fromText('{"enabled":false,"__proto__":{"polluted":true}}')
    const withoutKey = fromText('{"enabled":false}')

    expect(SNAP_PREFERENCES_SETTING.parse(withKey)).toEqual(
      SNAP_PREFERENCES_SETTING.parse(withoutKey),
    )
    expect(storeHolding(withKey).store.getPreferences().enabled).toBe(false)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('inside the kinds changes nothing', () => {
    const withKey = fromText('{"kinds":{"grid":false,"__proto__":{"polluted":true}}}')
    const withoutKey = fromText('{"kinds":{"grid":false}}')

    expect(SNAP_PREFERENCES_SETTING.parse(withKey)).toEqual(
      SNAP_PREFERENCES_SETTING.parse(withoutKey),
    )
    expect(storeHolding(withKey).store.getPreferences().kinds.grid).toBe(false)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})

describe('the snap preferences setting reading a stored radius that is too large for a number', () => {
  it('records the present behavior: the radius is read as infinity and is not clamped on read', () => {
    const parsed = SNAP_PREFERENCES_SETTING.parse(fromText(OVERSIZED_RADIUS_TEXT))

    expect(parsed?.pixelRadius).toBe(Infinity)
  })
})
