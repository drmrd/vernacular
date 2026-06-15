import type { CSSProperties } from 'react'
import type { NavMode } from './scene-nav-toolbar'

const HINT_LINES_BY_MODE: Record<NavMode, readonly string[]> = {
  orbit: ['Drag to orbit', 'Right-drag to pan', 'Scroll to zoom'],
  walk: ['Drag to look', 'W A S D to move'],
}

// A subtle caption anchored in the bottom-left corner of the pane, out of the canvas
// layout flow (absolute) so it does not shrink the height-measuring canvas, and inert to
// pointer events so it never blocks a drag. It reads the design tokens that cascade from
// the editor shell it renders inside.
const HINT_STYLE: CSSProperties = {
  position: 'absolute',
  left: '0.75rem',
  bottom: '0.75rem',
  margin: 0,
  padding: '0.35rem 0.6rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.1rem',
  listStyle: 'none',
  fontSize: '0.72rem',
  color: 'var(--color-text-muted)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '0.3rem',
  pointerEvents: 'none',
  userSelect: 'none',
}

/**
 * The per-mode controls hint lines for the three-dimensional camera. Orbit mode rotates
 * on a left drag, pans on a right drag, and zooms on the wheel; walk mode looks on a drag
 * and moves with the W, A, S, and D keys.
 */
// eslint-disable-next-line react-refresh/only-export-components -- the pure hint data ships beside the component that renders it and this slice's test imports cameraControlsHint from ./camera-controls-hint.
export function cameraControlsHint(mode: NavMode): readonly string[] {
  return HINT_LINES_BY_MODE[mode]
}

/**
 * A small, pointer-inert caption that lists the active camera mode's controls over the
 * scene canvas. It is inert to pointer events so it never blocks an orbit or look drag.
 */
export function CameraControlsHint({ mode }: { mode: NavMode }) {
  return (
    <ul
      role="group"
      aria-label="Camera controls"
      className="camera-controls-hint"
      style={HINT_STYLE}
    >
      {cameraControlsHint(mode).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}
