import { ToolbarButton } from './toolbar-button'

interface SceneObjectControlsProps {
  atDefault?: boolean | undefined
  onReset?: (() => void) | undefined
}

const NOTHING_TO_CLOSE_TITLE =
  'Nothing to close. Open a door or window in walk mode with the E key.'

const CLOSE_TITLE =
  'Shuts every door and window that stands open. In walk mode, the R key does the same.'

/**
 * The scene-objects group: one control that returns every interactive object in the view to
 * its default state, today by closing every opened door and window. It works in both camera
 * modes, because the objects it acts on are not tied to either camera. Its props are
 * optional; it supplies the at-default stand-ins so the toolbar can forward them straight
 * through.
 */
export function SceneObjectControls({
  atDefault = true,
  onReset = () => {},
}: SceneObjectControlsProps) {
  return (
    <div
      role="group"
      aria-label="Scene objects"
      className="scene-nav-toolbar__objects scene-nav-toolbar__secondary"
    >
      <ToolbarButton
        label="Close doors and windows"
        onActivate={onReset}
        unavailableReason={atDefault ? NOTHING_TO_CLOSE_TITLE : undefined}
        title={CLOSE_TITLE}
      />
    </div>
  )
}
