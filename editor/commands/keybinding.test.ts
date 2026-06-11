import { describe, it, expect } from 'vitest'
import { parseKeybinding, eventToKeystroke, keystrokesMatch } from './keybinding'

describe('keybinding', () => {
  it('parses a modifier chord into a normalized keystroke', () => {
    expect(parseKeybinding('Mod+Shift+Z')).toEqual({ key: 'z', mod: true, shift: true })
    expect(parseKeybinding('Delete')).toEqual({ key: 'delete', mod: false, shift: false })
  })

  it('reads Mod as Cmd on mac and Ctrl elsewhere', () => {
    const meta = { key: 'z', metaKey: true, ctrlKey: false, shiftKey: false }
    const ctrl = { key: 'z', metaKey: false, ctrlKey: true, shiftKey: false }
    expect(eventToKeystroke(meta, true)).toEqual({ key: 'z', mod: true, shift: false })
    expect(eventToKeystroke(ctrl, true)).toEqual({ key: 'z', mod: false, shift: false })
    expect(eventToKeystroke(ctrl, false)).toEqual({ key: 'z', mod: true, shift: false })
  })

  it('matches a parsed binding against an event keystroke', () => {
    const binding = parseKeybinding('Mod+Z')
    const event = eventToKeystroke(
      { key: 'Z', metaKey: false, ctrlKey: true, shiftKey: false },
      false,
    )
    expect(keystrokesMatch(binding, event)).toBe(true)
  })
})
