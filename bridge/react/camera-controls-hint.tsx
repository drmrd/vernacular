import type { NavMode } from './scene-nav-toolbar'

const HINT_LINES_BY_MODE: Record<NavMode, readonly string[]> = {
  orbit: ['Drag to orbit', 'Right-drag to pan', 'Scroll to zoom'],
  walk: ['Drag to look', 'W A S D to move'],
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
      style={{ pointerEvents: 'none' }}
    >
      {cameraControlsHint(mode).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}
