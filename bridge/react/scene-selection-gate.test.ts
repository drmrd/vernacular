import { describe, it, expect } from 'vitest'

import { selectionEnabledForMode } from './scene-selection-gate'
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
