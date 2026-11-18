import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'input:not([disabled])',
  'button:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const PROGRAMMATIC_FOCUS_ONLY = '-1'

function focusableDescendants(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('tabindex') !== PROGRAMMATIC_FOCUS_ONLY,
  )
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

function trapTab(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') {
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
  if (!(event.target instanceof Node) || !container.contains(event.target)) {
    event.preventDefault()
  }
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
 * descendant. While it is mounted:
 * - Tab and Shift+Tab wrap inside the container. When focus is on none of the focusable
 *   descendants (on the container itself, say), Tab goes to the first and Shift+Tab to the last.
 * - The container can hold focus: it gets `tabindex="-1"` unless it already has a tabindex, so a
 *   press on a part of it that cannot take focus focuses the container instead of the page body.
 * - A mouse press outside the container, its shade included, leaves focus where it is.
 * - On unmount, focus returns to the opener, unless the caller has already moved it to a live
 *   element outside the container.
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
    focusableDescendants(container)[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => trapTab(event, container)
    const onMouseDown = (event: MouseEvent) => keepFocusOnPressOutside(event, container)
    container.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown, true)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown, true)
      undoFocusable()
      restoreFocus(opener, container)
    }
  }, [])
  return ref
}
