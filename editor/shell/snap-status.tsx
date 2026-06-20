import { useState } from 'react'
import { SnapPanel } from '../plan/snap-panel'
import { useSnapPreferences } from '../plan/snap-preferences-context'
import './snap-status.css'

// The status-bar snap indicator: it reports whether snapping is on and opens the
// precision popover (the per-kind toggles, master switch, and catch radius). Smart
// snapping stays the default; this popover is the opt-in precision surface that used
// to sit, always open, in the rail.
export function SnapStatus() {
  const [open, setOpen] = useState(false)
  const preferences = useSnapPreferences()
  return (
    <div className="snap-status">
      <button
        type="button"
        className="snap-status__indicator"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className={[
            'snap-status__marker',
            preferences.enabled ? 'snap-status__marker--on' : 'snap-status__marker--off',
          ].join(' ')}
          aria-hidden="true"
        >
          ◆
        </span>
        {preferences.enabled ? 'Snap' : 'Snap off'}
        <span
          className={['snap-status__caret', open && 'is-open'].filter(Boolean).join(' ')}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {open ? (
        <div className="snap-status__popover" role="dialog" aria-label="Snapping precision">
          <SnapPanel />
        </div>
      ) : null}
    </div>
  )
}
