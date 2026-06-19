import { Button } from '../design-system'
import './discard-dialog.css'

interface DiscardDialogProps {
  open: boolean
  projectName: string
  onConfirm: () => void
  onCancel: () => void
}

// Confirms a guarded destructive swap (New / Open / Import) on a dirty project.
// Renders nothing until a guarded action raises it, mirroring the RecoveryPrompt
// banner pattern rather than a heavy modal primitive.
export function DiscardDialog({ open, projectName, onConfirm, onCancel }: DiscardDialogProps) {
  if (!open) {
    return null
  }
  return (
    <div role="alertdialog" className="discard-dialog">
      <p className="discard-dialog__message">Discard unsaved changes to {projectName}?</p>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" onClick={onConfirm}>
        Discard
      </Button>
    </div>
  )
}
