interface SceneDisplayOptionsProps {
  edgeOverlay?: boolean | undefined
  onToggleEdgeOverlay?: (() => void) | undefined
  aimGuide?: boolean | undefined
  onToggleAimGuide?: (() => void) | undefined
}

interface DisplayToggleProps {
  label: string
  pressed: boolean
  onToggle: () => void
}

function DisplayToggle({ label, pressed, onToggle }: DisplayToggleProps) {
  return (
    <button
      type="button"
      className="scene-nav-toolbar__btn"
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}

/**
 * The display-options group: view-only styling toggles for the three-dimensional
 * scene, session state that is never saved to the project. It holds the
 * surface-edge overlay toggle (ADR-0132): pressed means the dark hidden-line
 * edges draw over every surface, and the default is off in Orbit. It also holds
 * the aim-guide toggle: pressed means the walk-mode dot and target outline show,
 * and the default is on. The props are optional; this group supplies their
 * session defaults so the toolbar can forward them straight through.
 */
export function SceneDisplayOptions({
  edgeOverlay = false,
  onToggleEdgeOverlay = () => {},
  aimGuide = true,
  onToggleAimGuide = () => {},
}: SceneDisplayOptionsProps) {
  return (
    <div
      role="group"
      aria-label="Display options"
      className="scene-nav-toolbar__display scene-nav-toolbar__secondary"
    >
      <DisplayToggle label="Surface edges" pressed={edgeOverlay} onToggle={onToggleEdgeOverlay} />
      <DisplayToggle label="Aim guide" pressed={aimGuide} onToggle={onToggleAimGuide} />
    </div>
  )
}
