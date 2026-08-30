import { useCallback, useMemo, useState } from 'react'
import type { WorkspaceState } from './use-workspace-state'

/** The wording a staged prompt asks with, question and destructive answer together. */
interface PromptWording {
  message: string
  confirmLabel: string
}

function deleteRecoveredCopy(projectName: string): PromptWording {
  return {
    message: `Delete the recovered copy of ${projectName}?`,
    confirmLabel: 'Delete recovered copy',
  }
}

export interface DiscardPrompt {
  /** The question to ask, or undefined for the default unsaved-changes wording. */
  message: string | undefined
  /** What to call the destructive answer, or undefined for the default "Discard". */
  confirmLabel: string | undefined
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
  const [wording, setWording] = useState<PromptWording | undefined>(undefined)
  const { recovery, resolveDiscard } = workspace
  const isPromptOpen = workspace.discardRequest !== null

  const answer = useCallback(
    (ok: boolean) => {
      setWording(undefined)
      resolveDiscard(ok)
    },
    [resolveDiscard],
  )

  // Memoized so the handlers keep the identity the effect that built them gives
  // them: rebuilding the pair every render would hand the shell a fresh recovery
  // prop on each keystroke, throwing away that stability for nothing.
  const labelledRecovery = useMemo(() => {
    if (recovery === null) {
      return null
    }
    return {
      onRestore: recovery.onRestore,
      onDiscard: () => {
        if (!isPromptOpen) {
          setWording(deleteRecoveredCopy(projectName))
        }
        return recovery.onDiscard()
      },
    }
  }, [recovery, isPromptOpen, projectName])

  return {
    message: wording?.message,
    confirmLabel: wording?.confirmLabel,
    recovery: labelledRecovery,
    answer,
  }
}
