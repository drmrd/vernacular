import { useCallback, useMemo } from 'react'
import type { ProjectCardActions } from '../editor/projects'
import { renameProject } from '../session'
import { renameFailureText } from './card-action-text'
import type { HistoryNavigation } from './use-history-navigation'

export interface CardActionsParts {
  readonly navigation: HistoryNavigation
  /** The start of an action that runs clears the page's sentence. */
  readonly onActionStart: () => void
  /** The end of an action that ran: the sentence to show, or null. */
  readonly onActionEnd: (notice: string | null) => void
}

/**
 * The actions of the cards. Each one runs through the navigation, so it never overlaps a flow, and
 * reports its failure as a sentence. An action that the navigation does not run does nothing.
 */
export function useCardActions({
  navigation,
  onActionStart,
  onActionEnd,
}: CardActionsParts): ProjectCardActions {
  const { runPageAction } = navigation
  const onRename = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const outcome = await runPageAction(async (ports, current) => {
        onActionStart()
        const result = await renameProject(ports, current, { id, name })
        return { result, currentClosed: false }
      })
      if (outcome === undefined) {
        return false
      }
      const { result } = outcome
      onActionEnd(result.ok ? null : renameFailureText(result.failure))
      return result.ok
    },
    [runPageAction, onActionStart, onActionEnd],
  )
  return useMemo(() => ({ onRename }), [onRename])
}
