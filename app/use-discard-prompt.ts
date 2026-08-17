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
// and the prompt that handler opens.
//
// The invariant that makes staging safe is that nothing is staged while a request is
// already open. The seam turns a second request away rather than opening a second
// prompt (see use-discard-confirmation.ts), so an unguarded stage would rewrite the
// question the live prompt asks without changing what its buttons do: a prompt reading
// "delete the recovered copy" whose Discard throws away the open document instead.
// Carrying the wording through the seam with the request would retire the staging, and
// belongs with the seam in app/use-workspace-state.ts.
export function useDiscardPrompt(workspace: WorkspaceState, projectName: string): DiscardPrompt {
  const [message, setMessage] = useState<string | undefined>(undefined)
  const recovery = workspace.recovery
  const isPromptOpen = workspace.discardRequest !== null
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
        if (!isPromptOpen) {
          setMessage(`Delete the recovered copy of ${projectName}?`)
        }
        return recovery.onDiscard()
      },
    },
    answer,
  }
}
