import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'input:not([disabled])',
  'button:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const PROGRAMMATIC_FOCUS_ONLY = '-1'
const INITIAL_FOCUS_ATTRIBUTE = 'data-initial-focus'

function focusableDescendants(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('tabindex') !== PROGRAMMATIC_FOCUS_ONLY,
  )
}

function firstFocusTarget(container: HTMLElement): HTMLElement | undefined {
  const focusable = focusableDescendants(container)
  return focusable.find((element) => element.hasAttribute(INITIAL_FOCUS_ATTRIBUTE)) ?? focusable[0]
}

function tabTarget(
  focusable: HTMLElement[],
  active: Element | null,
  backwards: boolean,
): HTMLElement | undefined {
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const activeIsInside = focusable.some((element) => element === active)
  if (!activeIsInside) {
    return backwards ? last : first
  }
  if (backwards && active === first) {
    return last
  }
  if (!backwards && active === last) {
    return first
  }
  return undefined
}

// The containers of the traps that are mounted, in mount order. Only the last one acts, so that
// a trap opened over another is not treated as "outside" by it. It is module state because the
// traps do not know each other; a keyboard router with a modal scope is meant to replace it.
const mountedTraps: HTMLElement[] = []

// The keydown that started while a trap was the active one, and that may still be on its way to
// the body. The capture listener records it before React's handlers run; the shared body listener
// stops it there even when the trap has unmounted in the meantime. Only the event in flight is
// held, so nothing else is kept and a later key is never touched. Like `mountedTraps`, it is
// module state that a keyboard router with a modal scope is meant to replace.
let keyDownInFlight: KeyboardEvent | null = null

function isActiveTrap(container: HTMLElement): boolean {
  return mountedTraps[mountedTraps.length - 1] === container
}

function trapTab(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab' || !isActiveTrap(container)) {
    return
  }
  const target = tabTarget(focusableDescendants(container), document.activeElement, event.shiftKey)
  if (target) {
    event.preventDefault()
    target.focus()
  }
}

// Gives the container a tabindex so that a press on a part of it that cannot take focus
// focuses the container instead of the page body. Returns the undo for what it added.
function makeContainerFocusable(container: HTMLElement): () => void {
  if (container.hasAttribute('tabindex')) {
    return () => undefined
  }
  container.setAttribute('tabindex', PROGRAMMATIC_FOCUS_ONLY)
  return () => container.removeAttribute('tabindex')
}

// Cancelling the default of a mousedown is what stops the browser from moving focus;
// the click that follows still reaches its handlers.
function keepFocusOnPressOutside(event: MouseEvent, container: HTMLElement): void {
  if (isActiveTrap(container) && !isInside(container, event.target)) {
    event.preventDefault()
  }
}

function isInside(container: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && container.contains(target)
}

// Runs at the body in the bubble phase, after the handlers inside the container, so those still
// receive every key. A key that starts outside the container pulls focus back in; for Tab the
// default is cancelled as well, so that the next press does not walk on from where focus was.
// Holding the key back is not done here but by `stopKeyDownInFlight`.
function pullFocusIntoTrap(event: KeyboardEvent, container: HTMLElement): void {
  if (!isActiveTrap(container) || isInside(container, event.target)) {
    return
  }
  if (event.key === 'Tab') {
    event.preventDefault()
  }
  const first = focusableDescendants(container)[0] ?? container
  first.focus()
}

// The one place that holds a key back: it stops the event, so the bubble-phase listeners on
// `document` and `window` do not see it, when a trap was the active one as the dispatch started.
// It is a single shared listener, so adding it again for another key is a no-op rather than a
// second copy. It acts for the recorded event only and removes itself on whatever event reaches
// it first. If a handler inside stops the event, it never reaches the body, and the next keydown
// that reaches the body clears the record.
function stopKeyDownInFlight(event: KeyboardEvent): void {
  const held = event === keyDownInFlight
  keyDownInFlight = null
  document.body.removeEventListener('keydown', stopKeyDownInFlight)
  if (held) {
    event.stopPropagation()
  }
}

// Runs at the start of the dispatch, before the handlers inside the container, so the key that
// closes the dialog is recorded while the trap is still the active one.
function recordKeyDownInFlight(event: KeyboardEvent, container: HTMLElement): void {
  if (!isActiveTrap(container)) {
    return
  }
  keyDownInFlight = event
  document.body.addEventListener('keydown', stopKeyDownInFlight)
}

// Skip the restore when the caller has already moved focus to a live element
// outside the trap (e.g. its own close handler restored the opener); otherwise
// we would redundantly re-focus, or clobber a deliberate handoff. Unmounting a
// child blurs it to <body>, so that case still falls through to restore.
function restoreFocus(opener: HTMLElement | null, container: HTMLElement): void {
  const active = document.activeElement as HTMLElement | null
  const focusMovedOutByCaller =
    active !== null && active !== document.body && active.isConnected && !container.contains(active)
  if (!focusMovedOutByCaller) {
    opener?.focus()
  }
}

/**
 * Makes the element that holds the returned ref a modal focus trap for as long as it is mounted.
 *
 * On mount it remembers the focused element as the opener and focuses the first focusable
 * descendant, or the focusable descendant that carries the `data-initial-focus` attribute when
 * there is one. A `summary` counts as focusable. While it is mounted:
 * - Tab and Shift+Tab wrap inside the container. When focus is on none of the focusable
 *   descendants (on the container itself, say), Tab goes to the first and Shift+Tab to the last.
 * - The container can hold focus: it gets `tabindex="-1"` unless it already has a tabindex, so a
 *   press on a part of it that cannot take focus focuses the container instead of the page body.
 * - A mouse press outside the container, its shade included, leaves focus where it is.
 * - On unmount, focus returns to the opener, unless the caller has already moved it to a live
 *   element outside the container.
 * - A keydown stops at `document.body` in the bubble phase, so a bubble-phase listener on
 *   `document` or `window` does not see it. Handlers inside the container, React ones included,
 *   still receive every key, and keyup passes untouched so that held keys are released. A keydown
 *   that starts outside the container is held back as well, and focus moves to the first
 *   focusable descendant (the container when there is none). A `keydown` that starts while a trap
 *   is the active one is held back from the bubble-phase listeners on `document` and `window`
 *   even when the trap unmounts while that event is being handled. The hold is for that one event
 *   only.
 * - When several traps are mounted, only the most recently mounted one acts.
 *
 * Keys are held back at `document.body`, which assumes that the React root renders inside the
 * body. A capture-phase listener, an earlier listener on the body itself, and an event
 * dispatched straight at `document` or `window` still see every key. The editor's global key
 * listeners that run commands listen in the bubble phase; the one capture-phase `keydown` listener
 * on `window`, in `use-keybindings.ts`, only prevents the browser default of a bound chord and
 * runs no command.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const container = ref.current
    if (!container) {
      return
    }
    const opener = document.activeElement as HTMLElement | null
    const undoFocusable = makeContainerFocusable(container)
    firstFocusTarget(container)?.focus()
    const onKeyDown = (event: KeyboardEvent) => trapTab(event, container)
    const onMouseDown = (event: MouseEvent) => keepFocusOnPressOutside(event, container)
    const onBodyKeyDown = (event: KeyboardEvent) => pullFocusIntoTrap(event, container)
    const onCaptureKeyDown = (event: KeyboardEvent) => recordKeyDownInFlight(event, container)
    const body = document.body
    mountedTraps.push(container)
    container.addEventListener('keydown', onKeyDown)
    body.addEventListener('keydown', onBodyKeyDown)
    document.addEventListener('keydown', onCaptureKeyDown, true)
    document.addEventListener('mousedown', onMouseDown, true)
    return () => {
      mountedTraps.splice(mountedTraps.lastIndexOf(container), 1)
      container.removeEventListener('keydown', onKeyDown)
      body.removeEventListener('keydown', onBodyKeyDown)
      document.removeEventListener('keydown', onCaptureKeyDown, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      undoFocusable()
      restoreFocus(opener, container)
    }
  }, [])
  return ref
}
