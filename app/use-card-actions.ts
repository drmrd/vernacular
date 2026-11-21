import { useCallback, useMemo } from 'react'
import type { ProjectCardActions } from '../editor/projects'
import {
  deleteProject,
  removeFolderFromList,
  renameProject,
  type ProjectCardModel,
  type SessionPorts,
} from '../session'
import type { AssetCache } from '../storage'
import { useCardExport } from './card-export'
import { deleteFailureText, removeFromListFailureText, renameFailureText } from './card-action-text'
import { createAssetLibrary } from './create-asset-library-registry'
import { libraryHashesOf } from './library-hashes'
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

/** What each action of a card needs besides its own request. */
type ActionRunner = Pick<HistoryNavigation, 'runPageAction'> &
  Pick<CardActionsParts, 'onActionStart' | 'onActionEnd'>

/** The lister of the library, or undefined while there is no library. */
function useLibraryLister(libraryAssets: CardActionsParts['libraryAssets']) {
  return useMemo(
    () => (libraryAssets ? createAssetLibrary(libraryAssets).registry : undefined),
    [libraryAssets],
  )
}

function useRename({ runPageAction, onActionStart, onActionEnd }: ActionRunner) {
  return useCallback(
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
}

/** The library's hashes are read inside the action, at the click, so they are never stale. */
function useDelete(
  { runPageAction, onActionStart, onActionEnd }: ActionRunner,
  library: ReturnType<typeof useLibraryLister>,
) {
  return useCallback(
    (id: string): void => {
      void runPageAction(async (ports, current) => {
        onActionStart()
        const libraryHashes = library ? await libraryHashesOf(() => library.list()) : undefined
        const result = await deleteProject(ports, current, { id, libraryHashes })
        return { result, currentClosed: result.currentClosed }
      }).then((outcome) => {
        if (outcome !== undefined) {
          const { result } = outcome
          onActionEnd(result.ok ? null : deleteFailureText(result.failure))
        }
      })
    },
    [runPageAction, onActionStart, onActionEnd, library],
  )
}

function useRemoveFromList({ runPageAction, onActionStart, onActionEnd }: ActionRunner) {
  return useCallback(
    (id: string): void => {
      void runPageAction(async (ports, current) => {
        onActionStart()
        const result = await removeFolderFromList(ports, current, id)
        return { result, currentClosed: result.currentClosed }
      }).then((outcome) => {
        if (outcome !== undefined) {
          const { result } = outcome
          onActionEnd(result.ok ? null : removeFromListFailureText(result.failure))
        }
      })
    },
    [runPageAction, onActionStart, onActionEnd],
  )
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
  const runner = { runPageAction: navigation.runPageAction, onActionStart, onActionEnd }
  const onRename = useRename(runner)
  const onDelete = useDelete(runner, useLibraryLister(libraryAssets))
  const onRemoveFromList = useRemoveFromList(runner)
  const onExport = useCardExport({ ports, handle: navigation.handle, cards, libraryAssets })
  return useMemo(
    () => ({
      onRename,
      onDelete,
      onRemoveFromList,
      ...(onExport === undefined ? {} : { onExport }),
    }),
    [onRename, onDelete, onRemoveFromList, onExport],
  )
}
