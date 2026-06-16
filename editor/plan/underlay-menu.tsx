import { useState, type FC } from 'react'

import type { UnderlayPanelProps } from './underlay-panel'

// A low-prominence launcher for the underlay controls, pinned to the tool rail.
// The trigger carries an "Underlay" label and the standard dropdown a11y
// attributes; the flyout it opens is added in a later task.
export const UnderlayMenu: FC<UnderlayPanelProps> = () => {
  const [open] = useState(false)
  return (
    <div className="underlay-menu">
      <button type="button" aria-haspopup="menu" aria-expanded={open}>
        <span aria-hidden="true">▦</span>
        Underlay
      </button>
    </div>
  )
}
