import { Button, useFocusTrap } from '../design-system'
import './discard-dialog.css'

interface DiscardDialogProps {
  open: boolean
  projectName: string
  /**
   * The question to ask, when the default is wrong for what is being thrown away.
   * The restore of a recovered copy, which replaces unsaved changes, wants the
   * default; the recovery banner's Discard, which deletes recovered snapshots and
   * leaves the open document alone, supplies its own.
   */
  message?: string | undefined
  /**
   * What to call the destructive answer, when "Discard" is wrong for it. The button
   * is what the user aims at, so a prompt asking about a recovered copy needs its
   * answer named too, not just its question.
   */
  confirmLabel?: string | undefined
  onConfirm: () => void
  onCancel: () => void
}

type DiscardPromptProps = Omit<DiscardDialogProps, 'open'>

export function DiscardDialog({ open, ...prompt }: DiscardDialogProps) {
  if (!open) {
    return null
  }
  return <DiscardPrompt {...prompt} />
}

// Mounted only while the prompt is open, because the focus trap arms in a mount
// effect: a component that stayed mounted and merely re-rendered with a new `open`
// value would never re-run it, and the second and later prompts would open with
// focus still behind them.
function DiscardPrompt({
  projectName,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: DiscardPromptProps) {
  const promptRef = useFocusTrap<HTMLDivElement>()
  const question = message ?? `Discard unsaved changes to ${projectName}?`
  return (
    // The trap and the Escape handler sit on the shade rather than the panel. The
    // trap makes the shade focusable, so a click on it keeps focus inside the
    // prompt and the handler still receives Escape.
    <div
      ref={promptRef}
      className="discard-dialog__backdrop"
      // Escape answers the prompt the safe way. The keystroke stops here so it does
      // not also reach the editor behind the prompt, which reads Escape as deselect.
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-dialog-message"
        className="discard-dialog"
      >
        <p id="discard-dialog-message" className="discard-dialog__message">
          {question}
        </p>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm}>
          {confirmLabel ?? 'Discard'}
        </Button>
      </div>
    </div>
  )
}
