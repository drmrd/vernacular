import { useCallback, useState } from 'react'

interface DiscardRequest {
  resolve: (ok: boolean) => void
}

export interface DiscardConfirmation {
  discardRequest: DiscardRequest | null
  confirmDiscard: () => Promise<boolean>
  resolveDiscard: (ok: boolean) => void
}

// Bridges the imperative discard guard to the declarative DiscardDialog: a guard
// asking to confirm opens the dialog and parks its resolver; the dialog's
// confirm/cancel resolves that promise and clears the request.
export function useDiscardConfirmation(): DiscardConfirmation {
  const [discardRequest, setDiscardRequest] = useState<DiscardRequest | null>(null)
  // Assumes a single in-flight request: a second confirmDiscard() while the dialog
  // is open would overwrite (and orphan) the first parked resolver. Not reachable
  // because the open dialog blocks further file-menu interaction.
  const confirmDiscard = useCallback(
    () => new Promise<boolean>((resolve) => setDiscardRequest({ resolve })),
    [],
  )
  const resolveDiscard = useCallback((ok: boolean) => {
    setDiscardRequest((request) => {
      request?.resolve(ok)
      return null
    })
  }, [])
  return { discardRequest, confirmDiscard, resolveDiscard }
}
