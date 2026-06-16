// A keystroke is ignored while the user is typing in a form control so editing a
// name, thickness, or angle is never hijacked by a tool shortcut.
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}
