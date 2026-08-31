import { useEffect, useRef, useState, type FC, type RefObject } from 'react'

import { Button } from '../design-system'
import { UnderlayRow, type UnderlayPanelProps } from './underlay-panel'
import '../design-system/menu-surface.css'
import './underlay-menu.css'

interface DismissOnEscapeOptions {
  active: boolean
  close: () => void
}

// Close the flyout when Escape is pressed, mirroring the dropdown dismissal
// pattern used elsewhere in the shell. The listener is attached only while the
// caller reports the dismissal as active.
function useDismissOnEscape({ active, close }: DismissOnEscapeOptions): void {
  useEffect(() => {
    if (!active) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [active, close])
}

interface DismissOnOutsidePointerOptions {
  active: boolean
  rootRef: RefObject<HTMLDivElement | null>
  close: () => void
}

// Close the flyout when a pointer goes down outside the menu root, mirroring
// the dropdown dismissal pattern used elsewhere in the shell. The listener is
// attached only while the caller reports the dismissal as active.
function useDismissOnOutsidePointer({
  active,
  rootRef,
  close,
}: DismissOnOutsidePointerOptions): void {
  useEffect(() => {
    if (!active) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [active, rootRef, close])
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
  armedUnderlayId,
  knownDistance,
  onKnownDistanceChange,
}) => {
  // Forward the two co-dependent calibration props together or not at all,
  // satisfying exactOptionalPropertyTypes without splitting them apart.
  const calibrationProps =
    knownDistance !== undefined && onKnownDistanceChange !== undefined
      ? { knownDistance, onKnownDistanceChange }
      : {}
  return (
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
            calibrating={underlay.id === armedUnderlayId}
            {...calibrationProps}
          />
        </li>
      ))}
    </ul>
  )
}

// A low-prominence launcher for the underlay controls, pinned to the tool rail.
// The trigger carries an "Underlay" label and the standard dropdown a11y
// attributes; clicking it opens a flyout with the underlay actions.
export const UnderlayMenu: FC<UnderlayPanelProps> = (props) => {
  const { onLoadImage, armedUnderlayId } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const calibrationIsArmed = armedUnderlayId !== null && armedUnderlayId !== undefined
  const close = () => setOpen(false)
  useDismissOnEscape({ active: open, close })
  // An armed calibration is measured by two clicks on the canvas, both of which
  // land outside the menu root, so dismissing on those would cancel it.
  useDismissOnOutsidePointer({ active: open && !calibrationIsArmed, rootRef, close })
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
