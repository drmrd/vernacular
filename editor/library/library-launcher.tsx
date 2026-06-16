import { useState, type ReactElement } from 'react'

import type { LibraryItem } from '../../storage'

import { LibraryPanel } from './library-panel'

import './library-launcher.css'

export interface LibraryLauncherProps {
  onPick: (item: LibraryItem) => void
  onImport: () => void
}

// A docked disclosure for the furniture library. The trigger toggles a panel
// that stays open while the user clicks the canvas to place furniture, so unlike
// the underlay flyout it does not dismiss on an outside pointer-down.
export function LibraryLauncher(props: LibraryLauncherProps): ReactElement {
  const { onPick, onImport } = props
  const [open, setOpen] = useState(false)
  return (
    <div className="library-launcher">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Furniture
      </button>
      {open ? <LibraryPanel onPick={onPick} onImport={onImport} /> : null}
    </div>
  )
}
