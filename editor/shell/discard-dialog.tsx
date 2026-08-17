import { Button, useFocusTrap } from '../design-system'
import './discard-dialog.css'

interface DiscardDialogProps {
  open: boolean
  projectName: string
  /**
   * The question to ask, when the default is wrong for what is being thrown away.
   * Guards that swap the open project (New, Open, Import) want the default; the
   * recovery banner, whose Discard deletes recovered snapshots and leaves the open
   * document alone, supplies its own.
   */
  message?: string | undefined
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
function DiscardPrompt({ projectName, message, onConfirm, onCancel }: DiscardPromptProps) {
  const promptRef = useFocusTrap<HTMLDivElement>()
  const question = message ?? `Discard unsaved changes to ${projectName}?`
  return (
    // The trap and the Escape handler sit on the shade rather than the panel, and
    // the shade carries a tabindex so it can hold focus itself. A shade that cannot
    // hold focus hands it to the document body when clicked, and a handler bound
    // inside the prompt then never sees another keystroke: Escape stops answering
    // and Tab walks off into the frame this prompt exists to block.
    <div
      ref={promptRef}
      tabIndex={-1}
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
          Discard
        </Button>
      </div>
    </div>
  )
}
