import {
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'

// Only enabled radios take part in roving: a disabled (planned) option is never
// a focus or selection target, so arrow keys step over it.
const ENABLED_RADIO_SELECTOR = '[role="radio"]:not([aria-disabled="true"])'

const FORWARD_KEYS: ReadonlySet<string> = new Set(['ArrowRight', 'ArrowDown'])
const BACKWARD_KEYS: ReadonlySet<string> = new Set(['ArrowLeft', 'ArrowUp'])
const NAVIGATION_KEYS: ReadonlySet<string> = new Set([
  ...FORWARD_KEYS,
  ...BACKWARD_KEYS,
  'Home',
  'End',
])

function enabledRadios(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(ENABLED_RADIO_SELECTOR))
}

// The index the given navigation key targets within the enabled radios. Forward
// and backward wrap around the ends; an out-of-group active element seeds the
// first (forward) or last (backward) radio so the group is always enterable.
function targetIndex(key: string, current: number, count: number): number {
  if (key === 'Home') {
    return 0
  }
  if (key === 'End') {
    return count - 1
  }
  if (FORWARD_KEYS.has(key)) {
    return current === -1 ? 0 : (current + 1) % count
  }
  return current === -1 ? count - 1 : (current - 1 + count) % count
}

// Selection follows focus in a radiogroup: move focus to the target radio and
// activate it (its click handler owns the actual selection), so arrow keys both
// move and select in one step.
function roveSelection(container: HTMLElement, key: string): void {
  const radios = enabledRadios(container)
  if (radios.length === 0) {
    return
  }
  const current = radios.indexOf(document.activeElement as HTMLElement)
  const target = radios[targetIndex(key, current, radios.length)]
  if (target === undefined) {
    return
  }
  target.focus()
  target.click()
}

export interface RovingRadioGroup<C extends HTMLElement> {
  containerRef: RefObject<C | null>
  onKeyDown: (event: ReactKeyboardEvent) => void
}

/**
 * Wires arrow-key roving for a single-select radiogroup. Spread `containerRef`
 * onto the element carrying `role="radiogroup"` and `onKeyDown` onto the same
 * element. Each option renders `role="radio"`, `aria-checked`, and a roving
 * `tabIndex` (0 for the checked option, -1 for the rest) so the group is a single
 * tab stop; the hook handles ArrowLeft/ArrowRight/ArrowUp/ArrowDown plus Home/End.
 */
export function useRovingRadioGroup<C extends HTMLElement = HTMLDivElement>(): RovingRadioGroup<C> {
  const containerRef = useRef<C | null>(null)
  const onKeyDown = useCallback((event: ReactKeyboardEvent) => {
    const container = containerRef.current
    if (container === null || !NAVIGATION_KEYS.has(event.key)) {
      return
    }
    event.preventDefault()
    // The group has consumed the key. Without this the same arrow also reaches the
    // window shortcuts, so roving between tools would nudge the selection at the
    // same time.
    event.stopPropagation()
    roveSelection(container, event.key)
  }, [])
  return { containerRef, onKeyDown }
}
