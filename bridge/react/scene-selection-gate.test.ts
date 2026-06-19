import { describe, it, expect } from 'vitest'

import { selectionEnabledForMode, selectionAllowed } from './scene-selection-gate'
import type { NavMode } from './scene-nav-toolbar'

describe('selectionEnabledForMode', () => {
  it('allows a click to commit selection in orbit mode', () => {
    expect(selectionEnabledForMode('orbit')).toBe(true)
  })

  it('suppresses click-to-select in walk mode', () => {
    // In walk mode a click engages pointer lock for mouse-look only; it must not also pick
    // the entity under the cursor, so the gate returns false and no selection is committed.
    expect(selectionEnabledForMode('walk')).toBe(false)
  })

  it('suppresses selection only for walk, allowing every other navigation mode', () => {
    // Walk is the sole mode that suppresses selection. Keying on "not walk" rather than an
    // explicit allow-list keeps any future non-walk mode (orbit being the one today) on the
    // selection-allowed branch, so adding a mode does not silently disable picking.
    const allowed = (['orbit'] satisfies NavMode[]).filter(selectionEnabledForMode)
    const suppressed = (['orbit', 'walk'] satisfies NavMode[]).filter(
      (mode) => !selectionEnabledForMode(mode),
    )

    expect(allowed).toEqual(['orbit'])
    expect(suppressed).toEqual(['walk'])
  })
})

describe('selectionAllowed', () => {
  it('suppresses selection by default when the toggle is off, even in orbit mode', () => {
    // Click-to-select is opt-in: the user toggle is off by default, so an orbit-mode click
    // commits no selection until the toggle is turned on.
    expect(selectionAllowed({ enabled: false, mode: 'orbit' })).toBe(false)
  })

  it('allows selection when the toggle is on and the mode is not walk', () => {
    expect(selectionAllowed({ enabled: true, mode: 'orbit' })).toBe(true)
  })

  it('suppresses selection in walk mode even when the toggle is on', () => {
    // A walk-mode click engages pointer lock for mouse-look only; it must stay a pure
    // pointer-lock interaction, so walk overrides the toggle and commits no selection.
    expect(selectionAllowed({ enabled: true, mode: 'walk' })).toBe(false)
  })

  it('suppresses selection when both the toggle is off and the mode is walk', () => {
    expect(selectionAllowed({ enabled: false, mode: 'walk' })).toBe(false)
  })
})
