import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'

type MenuKeyboardEvent = KeyboardEvent | ReactKeyboardEvent

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
 * `menuProps` onto the `role="menu"` list; `open` gates rendering the list. Later
 * behaviors flesh out the keyboard handlers; for now they are stable no-ops.
 */
export function useMenuButton<C extends HTMLElement = HTMLDivElement>(): MenuButton<C> {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<C | null>(null)

  const toggle = useCallback(() => setOpen((current) => !current), [])
  const close = useCallback(() => setOpen(false), [])
  // The explicit annotation widens the inferred `() => void` to the keyboard
  // signature the `MenuButton` interface requires. The body is a deliberate
  // no-op for now; later behaviors (B2-B5) add the actual key handling here.
  const onKeyDown: (event: MenuKeyboardEvent) => void = useCallback(() => {}, [])

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
        onKeyDown,
      }) as const,
    [onKeyDown],
  )

  return { open, toggle, close, containerRef, triggerProps, menuProps }
}
