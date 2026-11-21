import { useCallback, useMemo } from 'react'
import type { ProjectCardActions } from '../editor/projects'
import { renameProject, type ProjectCardModel, type SessionPorts } from '../session'
import type { AssetCache } from '../storage'
import { useCardExport } from './card-export'
import { renameFailureText } from './card-action-text'
import type { HistoryNavigation } from './use-history-navigation'

export interface CardActionsParts {
  readonly navigation: HistoryNavigation
  readonly ports: SessionPorts | null
  /** The cards on the page, which name the projects that an export shows. */
  readonly cards?: readonly ProjectCardModel[] | undefined
  /** The library whose packs supply assets, for an export. */
  readonly libraryAssets?: AssetCache | null | undefined
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
  ports,
  cards,
  libraryAssets,
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
  const onExport = useCardExport({ ports, handle: navigation.handle, cards, libraryAssets })
  return useMemo(
    () => ({ onRename, ...(onExport === undefined ? {} : { onExport }) }),
    [onRename, onExport],
  )
}
