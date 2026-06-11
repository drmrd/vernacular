const MODIFIER_TOKEN = 'mod'
const SHIFT_TOKEN = 'shift'

/** A normalized keyboard chord: a key plus the modifier and shift state. */
export interface Keystroke {
  key: string
  mod: boolean
  shift: boolean
}

/** Parse a binding such as "Mod+Shift+Z" into a normalized keystroke. */
export function parseKeybinding(binding: string): Keystroke {
  const tokens = binding.split('+').map((token) => token.toLowerCase())
  const keystroke: Keystroke = { key: '', mod: false, shift: false }
  for (const token of tokens) {
    if (token === MODIFIER_TOKEN) {
      keystroke.mod = true
    } else if (token === SHIFT_TOKEN) {
      keystroke.shift = true
    } else {
      keystroke.key = token
    }
  }
  return keystroke
}

/** Read a keyboard event into a normalized keystroke, treating Mod as Cmd on mac and Ctrl elsewhere. */
export function eventToKeystroke(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>,
  isMac: boolean,
): Keystroke {
  return {
    key: event.key.toLowerCase(),
    mod: isMac ? event.metaKey : event.ctrlKey,
    shift: event.shiftKey,
  }
}

/** Two keystrokes match when their key, modifier, and shift state all agree. */
export function keystrokesMatch(a: Keystroke, b: Keystroke): boolean {
  return a.key === b.key && a.mod === b.mod && a.shift === b.shift
}
