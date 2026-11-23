import { useId, type ReactElement } from 'react'
import { Button, useFocusTrap } from '../design-system'
import { timeText } from './card-text'
import { answerOnEscape, DIALOG_SHADE_CLASS } from './dialog-shade'
import './two-files-dialog.css'

export interface TwoFilesDialogProps {
  readonly state: 'newer-main' | 'both-readable'
  readonly secondFileName: string
  /** ISO times of the last change; shown in the both-readable state. */
  readonly mainChangedAt?: string | undefined
  readonly secondChangedAt?: string | undefined
  /** True before an open: the primary control reads "Open and keep both plan files". */
  readonly beforeOpen?: boolean
  readonly onKeepBoth: () => void
  readonly onOpenAsNew: () => void
  readonly onReplace: () => void
  /** Given in the both-readable state only. */
  readonly onRemove?: () => void
  /** Given before an open only: Cancel shows, and Escape cancels. */
  readonly onCancel?: () => void
  /** True while a choice runs: every control is disabled. */
  readonly busy?: boolean
}

const TITLE = 'This project has two plan files'
const OPEN_AS_NEW_SENTENCE =
  "The new project is stored in this browser. The second plan file moves to the project's backups."
const REPLACE_WARNING =
  "The plan file vernacular.json moves to the project's backups. No control brings it back. You cannot undo this action."
const REMOVE_SENTENCE = "The second plan file moves to the project's backups."

/** While a choice runs, Escape does nothing, as every control is disabled. */
function ignore(): void {}

function changedPhrase(changedAt: string | undefined): string {
  const time = timeText(changedAt)
  return time === undefined ? 'at an unknown time' : `on ${time}`
}

function factsSentence({
  state,
  secondFileName,
  mainChangedAt,
  secondChangedAt,
}: TwoFilesDialogProps): string {
  if (state === 'newer-main') {
    return `A newer version of Vernacular saved the plan file vernacular.json. This version cannot read it. The second plan file, ${secondFileName}, holds the changes that this version saved.`
  }
  return `The plan file vernacular.json changed ${changedPhrase(mainChangedAt)}. The second plan file, ${secondFileName}, changed ${changedPhrase(secondChangedAt)}. An older version of Vernacular saved the second plan file.`
}

/** A choice that changes the stored files: its control, described by what it does to them. */
function Choice({
  label,
  sentence,
  onChoose,
  busy,
}: {
  readonly label: string
  readonly sentence: string
  readonly onChoose: () => void
  readonly busy: boolean
}): ReactElement {
  const sentenceId = useId()
  return (
    <>
      <Button onClick={onChoose} disabled={busy} aria-describedby={sentenceId}>
        {label}
      </Button>
      <p id={sentenceId} className="two-files-dialog__sentence">
        {sentence}
      </p>
    </>
  )
}

function Choices({ onOpenAsNew, onReplace, onRemove, busy = false }: TwoFilesDialogProps) {
  return (
    <>
      <Choice
        label="Open the second plan file as a new project"
        sentence={OPEN_AS_NEW_SENTENCE}
        onChoose={onOpenAsNew}
        busy={busy}
      />
      <Choice
        label="Replace vernacular.json with the second plan file"
        sentence={REPLACE_WARNING}
        onChoose={onReplace}
        busy={busy}
      />
      {onRemove !== undefined && (
        <Choice
          label="Remove the second plan file"
          sentence={REMOVE_SENTENCE}
          onChoose={onRemove}
          busy={busy}
        />
      )}
    </>
  )
}

/**
 * The choice between the two plan files of a project. Keep both is the harmless choice: it
 * changes nothing, and it answers Escape. Before an open, Cancel answers Escape instead. Mount it
 * only while it shows: the focus trap arms in a mount effect, so a dialog that stayed mounted
 * would not take the focus the second time.
 */
export function TwoFilesDialog(props: TwoFilesDialogProps): ReactElement {
  const { beforeOpen = false, onKeepBoth, onCancel, busy = false } = props
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const idBase = useId()
  const titleId = `${idBase}-title`
  const factsId = `${idBase}-facts`
  const onKeyDown = answerOnEscape(busy ? ignore : (onCancel ?? onKeepBoth))
  return (
    // The trap and the Escape handler sit on the shade, which the trap makes focusable.
    <div ref={dialogRef} className={DIALOG_SHADE_CLASS} onKeyDown={onKeyDown}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={factsId}
        className="two-files-dialog"
      >
        <h2 id={titleId} className="two-files-dialog__title">
          {TITLE}
        </h2>
        <p id={factsId} className="two-files-dialog__sentence">
          {factsSentence(props)}
        </p>
        <Button variant="primary" onClick={onKeepBoth} disabled={busy} data-initial-focus>
          {beforeOpen ? 'Open and keep both plan files' : 'Keep both plan files'}
        </Button>
        <Choices {...props} />
        {onCancel !== undefined && (
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
