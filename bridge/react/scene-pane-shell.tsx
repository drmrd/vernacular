import { useCallback, useState, type ReactNode } from 'react'
import { CameraControlsHint } from './camera-controls-hint'
import type { NavMode } from './scene-nav-toolbar'

// Tracks whether a pointer drag is underway on the preview pane so the cursor can switch
// between grab and grabbing. Native canvas pointer events bubble to the pane wrapper, so
// an orbit or look drag flips this; pointer up or leaving the pane clears it.
function useDragging() {
  const [dragging, setDragging] = useState(false)
  const start = useCallback(() => setDragging(true), [])
  const stop = useCallback(() => setDragging(false), [])
  return {
    dragging,
    paneHandlers: { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop },
  }
}

// The camera pane's floor within the preview column: even when the nav toolbar above it
// wraps onto every row it has, the canvas keeps at least this share of the column's height
// (issue #457). The toolbar carries min-height: 0 and overflow-y: auto in
// scene-nav-toolbar.css so it shrinks to whatever share this leaves it and scrolls
// internally instead of pushing the canvas below a usable size.
export const CAMERA_PANE_MIN_HEIGHT_SHARE = '55%'

// The interactive preview pane: it wraps the canvas and overlay (passed as children), shows
// the grab/grabbing cursor that signals the canvas is draggable, and overlays the per-mode
// controls hint. The hint is inert to pointer events, so it never blocks a drag.
export function ScenePaneShell({ mode, children }: { mode: NavMode; children: ReactNode }) {
  const { dragging, paneHandlers } = useDragging()
  return (
    <div
      className="scene-camera-pane"
      style={{
        position: 'relative',
        flex: 1,
        minHeight: CAMERA_PANE_MIN_HEIGHT_SHARE,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      {...paneHandlers}
    >
      {children}
      <CameraControlsHint mode={mode} />
    </div>
  )
}
