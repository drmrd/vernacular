import { useState } from 'react'
import type { WorkspaceState } from './use-workspace-state'

export interface DiscardPrompt {
  /** The question to ask, or undefined for the default unsaved-changes wording. */
  message: string | undefined
  /** The recovery handlers to hand the shell, with Discard labelled on the way. */
  recovery: WorkspaceState['recovery']
  answer: (ok: boolean) => void
}

// The recovery banner's Discard deletes the recovered snapshots and leaves the open
// document untouched, so its confirmation must not borrow the unsaved-changes wording
// New and Open use. Both prompts come out of the one confirm seam in
// useWorkspaceState, which carries no wording with the request, so the label is staged
// here instead: this sits at the one point holding both the banner's Discard handler
// and the prompt that handler opens. Staging is sound because the seam admits a single
// request at a time (see use-discard-confirmation.ts) and the label is dropped as soon
// as the prompt is answered.
export function useDiscardPrompt(workspace: WorkspaceState, projectName: string): DiscardPrompt {
  const [message, setMessage] = useState<string | undefined>(undefined)
  const recovery = workspace.recovery
  const answer = (ok: boolean) => {
    setMessage(undefined)
    workspace.resolveDiscard(ok)
  }
  if (recovery === null) {
    return { message, recovery: null, answer }
  }
  return {
    message,
    recovery: {
      onRestore: recovery.onRestore,
      onDiscard: () => {
        setMessage(`Delete the recovered copy of ${projectName}?`)
        return recovery.onDiscard()
      },
    },
    answer,
  }
}
