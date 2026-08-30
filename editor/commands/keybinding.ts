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

// How each platform prints a modifier. A Mac keyboard carries the glyphs on the
// keys themselves and runs them together; everywhere else the names are spelled
// out and joined with a plus.
const MAC_MODIFIERS: Record<string, string> = { [MODIFIER_TOKEN]: '⌘', [SHIFT_TOKEN]: '⇧' }
const SPELLED_MODIFIERS: Record<string, string> = {
  [MODIFIER_TOKEN]: 'Ctrl',
  [SHIFT_TOKEN]: 'Shift',
}

/** A key name as it reads on the key: "z" prints as Z, "delete" as Delete. */
function keyLabel(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1)
}

/**
 * A binding printed the way the reader's own keyboard is labelled: "⌘⇧Z" on a Mac,
 * "Ctrl+Shift+Z" elsewhere. This is display only; matching still runs through
 * parseKeybinding, so the printed form never decides what a key does.
 */
export function formatKeybinding(binding: string, isMac: boolean): string {
  const modifiers = isMac ? MAC_MODIFIERS : SPELLED_MODIFIERS
  const parts = binding.split('+').map((token) => modifiers[token.toLowerCase()] ?? keyLabel(token))
  return parts.join(isMac ? '' : '+')
}

/** True when the running platform looks like macOS, which decides how a binding prints. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /mac/i.test(navigator.platform || navigator.userAgent)
}
