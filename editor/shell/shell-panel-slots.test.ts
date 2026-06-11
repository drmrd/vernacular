import { describe, it, expect } from 'vitest'
import {
  FLOOR_SWITCHER_SLOT,
  PAINT_PICKER_SLOT,
  PAINT_INSPECTOR_SLOT,
  SHELL_PANEL_SLOTS,
} from './shell-panel-slots'

describe('shell panel slots', () => {
  it('names the floor switcher, paint pickers, and paint inspector seams', () => {
    expect(FLOOR_SWITCHER_SLOT).toBe('floor-switcher')
    expect(PAINT_PICKER_SLOT).toBe('paint-pickers')
    expect(PAINT_INSPECTOR_SLOT).toBe('paint-inspector')
  })

  it('lists every slot id with no duplicates', () => {
    expect(new Set(SHELL_PANEL_SLOTS).size).toBe(SHELL_PANEL_SLOTS.length)
    expect(SHELL_PANEL_SLOTS).toContain(FLOOR_SWITCHER_SLOT)
    expect(SHELL_PANEL_SLOTS).toContain(PAINT_PICKER_SLOT)
    expect(SHELL_PANEL_SLOTS).toContain(PAINT_INSPECTOR_SLOT)
  })
})
