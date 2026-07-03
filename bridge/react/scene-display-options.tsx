interface SceneDisplayOptionsProps {
  edgeOverlay?: boolean | undefined
  onToggleEdgeOverlay?: (() => void) | undefined
}

/**
 * The display-options group: view-only styling toggles for the three-dimensional
 * scene, session state that is never saved to the project. Today it holds one
 * control, the surface-edge overlay toggle (ADR-0132): pressed means the dark
 * hidden-line edges draw over every surface, and the default is off in Orbit. The
 * props are optional; this group supplies their session defaults so the toolbar can
 * forward them straight through.
 */
export function SceneDisplayOptions({
  edgeOverlay = false,
  onToggleEdgeOverlay = () => {},
}: SceneDisplayOptionsProps) {
  return (
    <div
      role="group"
      aria-label="Display options"
      className="scene-nav-toolbar__display scene-nav-toolbar__secondary"
    >
      <button
        type="button"
        className="scene-nav-toolbar__btn"
        aria-pressed={edgeOverlay}
        onClick={onToggleEdgeOverlay}
      >
        Surface edges
      </button>
    </div>
  )
}
