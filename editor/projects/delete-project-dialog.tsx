import { useId, type KeyboardEvent, type ReactElement } from 'react'
import { Button, useFocusTrap } from '../design-system'

export interface DeleteProjectDialogProps {
  readonly name: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

const CONSEQUENCE =
  'This removes the project and its recovery copies from this browser. You cannot undo this action.'

/** Escape answers the safe way and stops here, so it reaches nothing behind the dialog. */
function cancelOnEscape(onCancel: () => void): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
    }
  }
}

/**
 * The question before a delete. Mount it only while it shows: the focus trap arms in a mount
 * effect, so a dialog that stayed mounted would not take the focus the second time.
 */
export function DeleteProjectDialog({
  name,
  onConfirm,
  onCancel,
}: DeleteProjectDialogProps): ReactElement {
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const idBase = useId()
  const titleId = `${idBase}-title`
  const consequenceId = `${idBase}-consequence`
  return (
    // The trap and the Escape handler sit on the shade, which the trap makes focusable.
    <div
      ref={dialogRef}
      className="delete-project-dialog__backdrop"
      onKeyDown={cancelOnEscape(onCancel)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={consequenceId}
        className="delete-project-dialog"
      >
        <p id={titleId} className="delete-project-dialog__title">
          {`Delete "${name}"?`}
        </p>
        <p id={consequenceId} className="delete-project-dialog__consequence">
          {CONSEQUENCE}
        </p>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm}>
          Delete project
        </Button>
      </div>
    </div>
  )
}
