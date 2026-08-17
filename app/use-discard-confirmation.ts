import { useCallback, useRef, useState } from 'react'

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
//
// The ref is the authority on what is in flight and the state is its mirror for
// rendering, because a second guard can ask while the first prompt is still up
// (the recovery banner and the file menu both route through this seam) and the
// state a callback closes over is a render behind.
export function useDiscardConfirmation(): DiscardConfirmation {
  const [discardRequest, setDiscardRequest] = useState<DiscardRequest | null>(null)
  const openRequest = useRef<DiscardRequest | null>(null)

  const confirmDiscard = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (openRequest.current !== null) {
          // One prompt is already on screen and only it can be answered. The
          // newcomer is turned away rather than taking the first one's place,
          // which would leave the first caller's promise unresolved and whatever
          // it guards, a project swap or a snapshot prune, stuck half-done.
          resolve(false)
          return
        }
        const request = { resolve }
        openRequest.current = request
        setDiscardRequest(request)
      }),
    [],
  )

  const resolveDiscard = useCallback((ok: boolean) => {
    const request = openRequest.current
    openRequest.current = null
    setDiscardRequest(null)
    request?.resolve(ok)
  }, [])

  return { discardRequest, confirmDiscard, resolveDiscard }
}
