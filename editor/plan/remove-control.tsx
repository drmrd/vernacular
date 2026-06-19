import { useState, type ReactElement } from 'react'
import { Button, Stack } from '../design-system'

export interface RemoveControlProps {
  onConfirm: () => void
}

// A two-step destructive control shared by the inspectors. The first click only
// arms the action by revealing an explicit confirm and a cancel; nothing is
// dispatched until the confirm is pressed. The accessible names ("Remove",
// "Confirm remove", "Cancel") are part of the contract the inspectors rely on.
export function RemoveControl({ onConfirm }: RemoveControlProps): ReactElement {
  const [confirming, setConfirming] = useState(false)

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
