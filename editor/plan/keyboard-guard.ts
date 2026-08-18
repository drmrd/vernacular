// Fields that swallow whatever is typed into them: editing a name, a thickness,
// or an angle, and choosing from a menu, all belong to the control rather than to
// a tool shortcut.
const TEXT_ENTRY_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

// The keys a focused button answers to itself. The tool rail and the tools panel
// are radiogroups built from buttons, so the arrows and Home/End rove between
// options; every other key passes through to the editor.
const CONTROL_NAVIGATION_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
])

// isContentEditable covers a keystroke anywhere inside an editable region, but
// jsdom leaves the property undefined, which made the earlier guard answer
// undefined instead of false. Reading the attribute off the nearest editable
// ancestor gives the same answer under the test environment and the browser alike.
const EDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"])'

function isEditableRegion(element: HTMLElement): boolean {
  return element.isContentEditable === true || element.closest(EDITABLE_SELECTOR) !== null
}

/**
 * True when the keystroke landed in a field that consumes everything typed into
 * it, so no tool shortcut hijacks a name, a thickness, or an angle being edited.
 * Buttons are deliberately absent: a focused button consumes only the keys it
 * navigates with, which is what `ownsKeystroke` answers.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return TEXT_ENTRY_TAGS.has(target.tagName) || isEditableRegion(target)
}

/**
 * The editor's keyboard guard: true when the focused control owns this particular
 * keystroke, so every window-level shortcut can leave it alone. A field owns every
 * key; a button owns only the arrows and Home/End it roves with, which keeps
 * Escape, Delete, and the rest alive while a tool chip still holds focus after a
 * click.
 */
// The keystrokes a tool has already answered. Held weakly, so an event is
// forgotten as soon as the browser is done with it.
const claimedKeystrokes = new WeakSet<KeyboardEvent>()

/**
 * Record that a tool has answered this keystroke, so the later rungs of the Escape
 * ladder stand down. A tool claims only when it actually did something: cancelling
 * an open run claims, pressing Escape at rest does not.
 */
export function claimKeystroke(event: KeyboardEvent): void {
  claimedKeystrokes.add(event)
}

/** Whether any tool has already answered this keystroke. */
export function wasKeystrokeClaimed(event: KeyboardEvent): boolean {
  return claimedKeystrokes.has(event)
}

export function ownsKeystroke(target: EventTarget | null, key: string): boolean {
  if (isTextEntry(target)) {
    return true
  }
  return (
    target instanceof HTMLElement && target.tagName === 'BUTTON' && CONTROL_NAVIGATION_KEYS.has(key)
  )
}
