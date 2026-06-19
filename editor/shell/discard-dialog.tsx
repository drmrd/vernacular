import { Button } from '../design-system'
import './discard-dialog.css'

interface DiscardDialogProps {
  open: boolean
  projectName: string
  onConfirm: () => void
  onCancel: () => void
}

// Mirrors the RecoveryPrompt banner rather than a heavy modal primitive.
export function DiscardDialog({ open, projectName, onConfirm, onCancel }: DiscardDialogProps) {
  if (!open) {
    return null
  }
  return (
    <div role="alertdialog" aria-labelledby="discard-dialog-message" className="discard-dialog">
      <p id="discard-dialog-message" className="discard-dialog__message">
        Discard unsaved changes to {projectName}?
      </p>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" onClick={onConfirm}>
        Discard
      </Button>
    </div>
  )
}
