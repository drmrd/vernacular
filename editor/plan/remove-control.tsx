import { useState, type ReactElement } from 'react'
import { Button, Stack } from '../design-system'

export interface RemoveControlProps {
  onConfirm: () => void
  targetId: string
}

// A two-step destructive control shared by the inspectors. The first click only
// arms the action by revealing an explicit confirm and a cancel; nothing is
// dispatched until the confirm is pressed. The accessible names ("Remove",
// "Confirm remove", "Cancel") are part of the contract the inspectors rely on.
export function RemoveControl({ onConfirm, targetId }: RemoveControlProps): ReactElement {
  const [confirming, setConfirming] = useState(false)

  // Adjusting state during render (React's documented pattern) rather than in a
  // useEffect: an effect would still paint one frame with the stale armed UI,
  // which is exactly the frame that lets a confirm meant for the old target
  // land on the new one.
  const [previousTargetId, setPreviousTargetId] = useState(targetId)
  if (targetId !== previousTargetId) {
    setPreviousTargetId(targetId)
    setConfirming(false)
  }

  if (confirming) {
    return (
      <Stack direction="horizontal" gap="space-2">
        <Button variant="destructive" onClick={onConfirm}>
          Confirm remove
        </Button>
        <Button variant="neutral" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </Stack>
    )
  }

  return (
    <Button variant="destructive" onClick={() => setConfirming(true)}>
      Remove
    </Button>
  )
}
