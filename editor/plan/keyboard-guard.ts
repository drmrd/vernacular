// The tags whose elements handle their own keystrokes: typing into a name,
// thickness, or angle field, choosing from a menu, and pressing a focused button
// all belong to the control, never to a tool shortcut.
const INTERACTIVE_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'])

/**
 * The editor's single keyboard guard: true when the keystroke landed on a control
 * that owns it, so every window-level shortcut can ignore it and no tool hijacks a
 * field, a menu, or a focused button. Buttons matter as much as text fields here,
 * because the tool rail and the tools panel are buttons: an arrow key aimed at them
 * roves the group rather than nudging the selection.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return INTERACTIVE_TAGS.has(target.tagName) || isEditableRegion(target)
}

// isContentEditable covers a keystroke anywhere inside an editable region, but
// jsdom leaves the property undefined, which made the old guard answer undefined
// instead of false. Reading the attribute off the nearest editable ancestor gives
// the same answer under the test environment and the browser alike.
const EDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"])'

function isEditableRegion(element: HTMLElement): boolean {
  return element.isContentEditable === true || element.closest(EDITABLE_SELECTOR) !== null
}

/**
 * The name the plan's authoring and furniture hooks still import. It is the same
 * guard; those two files are the last callers waiting to move to the new name.
 */
export const isTextEntry = isInteractiveTarget
