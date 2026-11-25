import { useId, type ReactElement } from 'react'
import { Button, useFocusTrap } from '../design-system'
import { answerOnEscape, DIALOG_SHADE_CLASS } from './dialog-shade'
import './repair-choice-dialog.css'

export interface RepairChoiceDialogProps {
  /** Absent: no replace control and no warning (a file that was not stored). */
  readonly onReplace?: (() => void) | undefined
  readonly onOpenAsNew: () => void
  readonly onCancel: () => void
  /** True while a choice runs: every control is disabled. */
  readonly busy?: boolean
}

const TITLE = 'Open the repaired project'
const STORED_OUTCOME =
  'A new file stores a repaired version of this project. The stored file stays unchanged.'
const FILE_OUTCOME =
  'A new file stores a repaired version of this project. The file that you chose stays unchanged.'
const WARNING = 'The data that the repair removes is lost. You cannot undo this action.'

/** While a choice runs, Escape does nothing, as Cancel is disabled. */
function ignore(): void {}

/** The replace control, described by its warning. */
function ReplaceChoice({
  onReplace,
  busy,
  warningId,
}: {
  readonly onReplace: () => void
  readonly busy: boolean
  readonly warningId: string
}): ReactElement {
  return (
    <>
      <Button onClick={onReplace} disabled={busy} aria-describedby={warningId}>
        Replace the stored project
      </Button>
      <p id={warningId} className="repair-choice-dialog__sentence">
        {WARNING}
      </p>
    </>
  )
}

/**
 * The two ways to open a repaired project. The replace choice exists only for a stored project, so
 * a dialog with no `onReplace` is the one for a file, and it shows the file text. Mount it only
 * while it shows: the focus trap arms in a mount effect, so a dialog that stayed mounted would not
 * take the focus the second time.
 */
export function RepairChoiceDialog({
  onReplace,
  onOpenAsNew,
  onCancel,
  busy = false,
}: RepairChoiceDialogProps): ReactElement {
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const idBase = useId()
  const titleId = `${idBase}-title`
  const outcomeId = `${idBase}-outcome`
  const onKeyDown = answerOnEscape(busy ? ignore : onCancel)
  return (
    // The trap and the Escape handler sit on the shade, which the trap makes focusable.
    <div ref={dialogRef} className={DIALOG_SHADE_CLASS} onKeyDown={onKeyDown}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={outcomeId}
        className="repair-choice-dialog"
      >
        <h2 id={titleId} className="repair-choice-dialog__title">
          {TITLE}
        </h2>
        <p id={outcomeId} className="repair-choice-dialog__sentence">
          {onReplace === undefined ? FILE_OUTCOME : STORED_OUTCOME}
        </p>
        <Button variant="primary" onClick={onOpenAsNew} disabled={busy} data-initial-focus>
          Open as a new project
        </Button>
        {onReplace !== undefined && (
          <ReplaceChoice onReplace={onReplace} busy={busy} warningId={`${idBase}-warning`} />
        )}
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
