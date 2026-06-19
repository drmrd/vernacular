import { useEffect, useRef, useState, type FC, type RefObject } from 'react'

import { Button } from '../design-system'
import { UnderlayRow, type UnderlayPanelProps } from './underlay-panel'
import '../design-system/menu-surface.css'
import './underlay-menu.css'

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

interface UnderlayMenuListProps extends UnderlayPanelProps {
  onLoadImageClick: () => void
}

// The flyout body: a Load image action followed by one row per underlay.
const UnderlayMenuList: FC<UnderlayMenuListProps> = ({
  floorId,
  underlays,
  dispatch,
  onCalibrate,
  onLoadImageClick,
}) => (
  <ul className="underlay-menu__list ds-menu-surface" role="menu">
    <li role="none">
      <Button role="menuitem" className="ds-menu-surface__row" onClick={onLoadImageClick}>
        Load image
      </Button>
    </li>
    {underlays.map((underlay, index) => (
      <li key={underlay.id} role="none">
        <UnderlayRow
          floorId={floorId}
          underlay={underlay}
          label={`Underlay ${index + 1}`}
          dispatch={dispatch}
          onCalibrate={onCalibrate}
        />
      </li>
    ))}
  </ul>
)

// A low-prominence launcher for the underlay controls, pinned to the tool rail.
// The trigger carries an "Underlay" label and the standard dropdown a11y
// attributes; clicking it opens a flyout with the underlay actions.
export const UnderlayMenu: FC<UnderlayPanelProps> = (props) => {
  const { onLoadImage } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useDismissOnOutside(open, rootRef, () => setOpen(false))
  return (
    <div className="underlay-menu" ref={rootRef}>
      <Button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">▦</span>
        Underlay
      </Button>
      {open ? (
        <UnderlayMenuList
          {...props}
          onLoadImageClick={() => {
            onLoadImage()
            setOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
