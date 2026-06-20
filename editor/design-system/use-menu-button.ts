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
 * menu key handler roves focus across the items; the trigger key handler is still
 * a no-op, with later behaviors (B4 Escape, B5 outside-dismiss) adding its handling.
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

  // The explicit annotation widens the inferred `() => void` to the keyboard
  // signature the `MenuButton` interface requires. The trigger body is still a
  // deliberate no-op for now; later behaviors add its key handling here.
  const onKeyDown: (event: MenuKeyboardEvent) => void = useCallback(() => {}, [])

  // Arrow keys rove focus between the menu items, wrapping past the last item
  // back to the first and before the first back to the last.
  const onMenuKeyDown = useCallback(
    (event: MenuKeyboardEvent) => roveMenuFocus(event, containerRef.current),
    [],
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
