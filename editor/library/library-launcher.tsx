import { useState, type ReactElement } from 'react'

import { Button } from '../design-system'
import type { LibraryItem } from '../../storage'

import { LibraryPanel } from './library-panel'

import './library-launcher.css'

export interface LibraryLauncherProps {
  onPick: (item: LibraryItem) => void
  onImport: () => void
  armed?: LibraryItem | null
  /** Whether an asset source is available to receive an imported model. */
  canImport?: boolean
  /** Bumped by the host after a successful import so the panel lists the registry again. */
  libraryRevision?: number
}

// A docked disclosure for the furniture library. The trigger toggles a panel
// that stays open while the user clicks the canvas to place furniture, so unlike
// the underlay flyout it does not dismiss on an outside pointer-down.
export function LibraryLauncher(props: LibraryLauncherProps): ReactElement {
  const { onPick, onImport, armed, canImport = true, libraryRevision = 0 } = props
  const [open, setOpen] = useState(false)
  return (
    <div className="library-launcher">
      <Button
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Furniture
      </Button>
      {open ? (
        <LibraryPanel
          onPick={onPick}
          onImport={onImport}
          armed={armed ?? null}
          canImport={canImport}
          libraryRevision={libraryRevision}
        />
      ) : null}
    </div>
  )
}
