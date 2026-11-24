import { useCallback, useMemo } from 'react'
import type { ProjectCardActions } from '../editor/projects'
import {
  deleteProject,
  removeFolderFromList,
  renameProject,
  type DeleteFailure,
  type DocumentHandle,
  type ProjectCardModel,
  type SessionPorts,
} from '../session'
import type { AssetCache, LibraryItem } from '../storage'
import { useCardExport } from './card-export'
import { deleteFailureText, removeFromListFailureText, renameFailureText } from './card-action-text'
import { createAssetLibrary } from './create-asset-library-registry'
import { libraryHashesOf } from './library-hashes'
import type { HistoryNavigation } from './use-history-navigation'

/** A library that lists the items it holds. */
interface LibraryLister {
  list(): Promise<readonly LibraryItem[]>
}

export interface CardActionsParts {
  readonly navigation: HistoryNavigation
  readonly ports: SessionPorts | null
  /** The cards on the page, which name the projects that an export shows. */
  readonly cards?: readonly ProjectCardModel[] | undefined
  /** The library: its packs supply an export, and its hashes are kept by a delete. */
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

/**
 * What a change of the list of projects gave: its failure, or none, and whether it ended the open
 * project.
 */
type ListChangeResult<Failure> =
  | { readonly ok: true; readonly currentClosed: boolean }
  | { readonly ok: false; readonly failure: Failure; readonly currentClosed: boolean }

/** The flow of a change of the list: a project leaves it, by its id. */
type ListChange<Failure> = (
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  id: string,
) => Promise<ListChangeResult<Failure>>

/** A change of the list that runs through the navigation, and reports its failure as a sentence. */
function useListChange<Failure>(
  { runPageAction, onActionStart, onActionEnd }: ActionRunner,
  change: ListChange<Failure>,
  failureText: (failure: Failure) => string,
) {
  return useCallback(
    (id: string): void => {
      void runPageAction(async (ports, current) => {
        onActionStart()
        const result = await change(ports, current, id)
        return { result, currentClosed: result.currentClosed }
      }).then((outcome) => {
        if (outcome !== undefined) {
          const { result } = outcome
          onActionEnd(result.ok ? null : failureText(result.failure))
        }
      })
    },
    [runPageAction, onActionStart, onActionEnd, change, failureText],
  )
}

/** The library's hashes are read inside the change, at the click, so they are never stale. */
function useDelete(runner: ActionRunner, library: LibraryLister | undefined) {
  const deleteWithLibrary = useCallback<ListChange<DeleteFailure>>(
    async (ports, current, id) => {
      const libraryHashes = library ? await libraryHashesOf(() => library.list()) : undefined
      return deleteProject(ports, current, { id, libraryHashes })
    },
    [library],
  )
  return useListChange(runner, deleteWithLibrary, deleteFailureText)
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
  const library = useLibraryLister(libraryAssets)
  const onDelete = useDelete(runner, library)
  const onRemoveFromList = useListChange(runner, removeFolderFromList, removeFromListFailureText)
  const onExport = useCardExport({ ports, handle: navigation.handle, cards, packs: library })
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
