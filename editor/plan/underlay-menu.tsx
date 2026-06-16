import { useEffect, useRef, useState, type FC, type RefObject } from 'react'

import type { UnderlayPanelProps } from './underlay-panel'

// Close the flyout when Escape is pressed or a pointer goes down outside the
// menu root, mirroring the dropdown dismissal pattern used elsewhere in the
// shell. The listeners are attached only while the flyout is open.
function useDismissOnOutside(
  open: boolean,
  rootRef: RefObject<HTMLDivElement | null>,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        close()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, rootRef, close])
}

// A low-prominence launcher for the underlay controls, pinned to the tool rail.
// The trigger carries an "Underlay" label and the standard dropdown a11y
// attributes; clicking it opens a flyout with the underlay actions.
export const UnderlayMenu: FC<UnderlayPanelProps> = ({ onLoadImage }) => {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useDismissOnOutside(open, rootRef, () => setOpen(false))
  return (
    <div className="underlay-menu" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">▦</span>
        Underlay
      </button>
      {open ? (
        <ul className="underlay-menu__list" role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onLoadImage()
                setOpen(false)
              }}
            >
              Load image
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  )
}
