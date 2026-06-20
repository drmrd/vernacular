import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'

type MenuKeyboardEvent = KeyboardEvent | ReactKeyboardEvent

// Shared no-op for the trigger key handler. This slot is reserved for an
// ArrowDown-opens-and-focuses-first nicety (a deferred WAI-ARIA Menu Button
// refinement); it is intentionally inert until that tested behavior lands.
const noop = (): void => {}

// Roving target for ArrowDown/ArrowUp. Returns the index of the menu item to
// focus next, or `null` when there is nothing to rove (no items). When the
// active element is not one of the items, ArrowDown lands on the first item and
// ArrowUp on the last as a sensible fallback.
function nextRovingIndex(items: HTMLElement[], key: 'ArrowDown' | 'ArrowUp'): number | null {
  const count = items.length
  if (count === 0) {
    return null
  }
  const current = items.indexOf(document.activeElement as HTMLElement)
  if (key === 'ArrowDown') {
    return current === -1 ? 0 : (current + 1) % count
  }
  return current === -1 ? count - 1 : (current - 1 + count) % count
}

// Moves focus to the roving target when an arrow key fires on an open menu, and
// suppresses the default scroll. A no-op for other keys or an absent container.
function roveMenuFocus(event: MenuKeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return
  }
  if (!container) {
    return
  }
  const items = Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]'))
  const target = nextRovingIndex(items, event.key)
  if (target === null) {
    return
  }
  event.preventDefault()
  items[target]?.focus()
}

// Restores DOM focus to the trigger button. The trigger renders unconditionally
// (it does not depend on `open`), so it is present even as the menu closes.
function focusTrigger(container: HTMLElement | null): void {
  container?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
}

// Dispatches an open-menu keydown: Escape returns focus to the trigger and
// closes the menu (focus first, since the trigger is not unmounted on close);
// arrow keys rove. Other keys fall through.
function handleMenuKeyDown(
  event: MenuKeyboardEvent,
  container: HTMLElement | null,
  close: () => void,
): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    focusTrigger(container)
    close()
    return
  }
  roveMenuFocus(event, container)
}

// While the menu is open, a pointer-down outside the container closes it (no
// focus move, since the user is interacting elsewhere). This also gives sibling
// mutual-exclusion for free: a pointer-down on another menu's trigger is outside
// this container, so this menu closes during the same gesture.
function useDismissOnOutsidePointerDown<C extends HTMLElement>(
  open: boolean,
  containerRef: RefObject<C | null>,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current
      // `event.target` is typed `EventTarget | null`; narrow to `Node` before
      // calling `contains`, since `EventTarget` has no `contains`.
      if (container && event.target instanceof Node && !container.contains(event.target)) {
        close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
    // `containerRef` is a stable `useRef` and is read inside the effect, so it is
    // intentionally omitted from the dependency array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close])
}

export interface MenuButton<C extends HTMLElement> {
  open: boolean
  toggle: () => void
  close: () => void
  containerRef: RefObject<C | null>
  triggerProps: {
    /* eslint-disable @typescript-eslint/naming-convention -- ARIA attribute names are spread onto an element, not renamable identifiers. */
    'aria-haspopup': 'menu'
    'aria-expanded': boolean
    /* eslint-enable @typescript-eslint/naming-convention */
    onClick: () => void
    onKeyDown: (event: MenuKeyboardEvent) => void
  }
  menuProps: {
    role: 'menu'
    onKeyDown: (event: MenuKeyboardEvent) => void
  }
}

/**
 * Owns the open/close plus keyboard contract shared by the header dropdown menus
 * (Project, Export). A consumer spreads `triggerProps` onto its trigger and
 * `menuProps` onto the `role="menu"` list; `open` gates rendering the list. The
 * menu key handler roves focus across the items and closes the menu on Escape;
 * a pointer-down outside the container also closes an open menu. The trigger key
 * handler is still a no-op.
 */
export function useMenuButton<C extends HTMLElement = HTMLDivElement>(): MenuButton<C> {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<C | null>(null)

  const toggle = useCallback(() => setOpen((current) => !current), [])
  const close = useCallback(() => setOpen(false), [])

  // When the menu opens, move DOM focus to its first item so keyboard users land
  // inside the menu. The items render only while `open`, and the effect runs after
  // commit, so they are present in the DOM when this lookup runs.
  useEffect(() => {
    if (!open) {
      return
    }
    const firstItem = containerRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    firstItem?.focus()
  }, [open])

  useDismissOnOutsidePointerDown(open, containerRef, close)

  // The trigger key handler is the reserved no-op (see `noop`). Widening the
  // annotation matches the keyboard signature the `MenuButton` interface requires.
  const onKeyDown: (event: MenuKeyboardEvent) => void = noop

  // Arrow keys rove focus between the menu items, wrapping past the last item
  // back to the first and before the first back to the last; Escape closes the
  // menu and returns focus to the trigger.
  const onMenuKeyDown = useCallback(
    (event: MenuKeyboardEvent) => handleMenuKeyDown(event, containerRef.current, close),
    [close],
  )

  const triggerProps = useMemo(
    () =>
      ({
        /* eslint-disable @typescript-eslint/naming-convention -- ARIA attribute names are spread onto an element, not renamable identifiers. */
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        /* eslint-enable @typescript-eslint/naming-convention */
        onClick: toggle,
        onKeyDown,
      }) as const,
    [open, toggle, onKeyDown],
  )

  const menuProps = useMemo(
    () =>
      ({
        role: 'menu',
        onKeyDown: onMenuKeyDown,
      }) as const,
    [onMenuKeyDown],
  )

  return { open, toggle, close, containerRef, triggerProps, menuProps }
}
