import { useCallback, useMemo } from 'react'
import { useNotifications } from '../editor/design-system'
import { openFolder, type SessionPorts } from '../session'
import type { AssetCache } from '../storage'
import { createAssetLibrary } from './create-asset-library-registry'
import { useSwitchFlow } from './project-action-helpers'
import type { HistoryNavigation } from './use-history-navigation'
import { useOpenFileAction } from './use-open-file-action'

/** What the actions of the Projects page run on. */
export interface PageActionsContext {
  readonly navigation: HistoryNavigation
  readonly ports: SessionPorts | null
  /** The library whose packs supply assets, for an import. */
  readonly libraryAssets: AssetCache | null | undefined
}

/** The actions of the Projects page that start from a file or a folder. */
export interface PageActions {
  readonly onImportFile: () => void
  readonly onDropFile: (file: File) => void
  /** Absent where the browser cannot open folders. */
  readonly onOpenFolder?: () => void
}

/**
 * Import file, a dropped file, and Open folder, run from the page through the owner of the open
 * project. A project that opens leaves the page. A refusal shows as the toast that the editor
 * shows for it, and the page stays.
 */
export function usePageActions({
  navigation,
  ports,
  libraryAssets,
}: PageActionsContext): PageActions {
  const notifications = useNotifications()
  const runFlow = navigation.runPageFlow
  const packs = useMemo(
    () => (libraryAssets ? createAssetLibrary(libraryAssets).registry : undefined),
    [libraryAssets],
  )
  const { onImportFile, onImportDroppedFile } = useOpenFileAction({
    notifications,
    runFlow,
    ...(packs === undefined ? {} : { packs }),
  })
  const runSwitch = useSwitchFlow(runFlow)
  const onOpenFolder = useCallback(() => {
    void runSwitch((given, current) => openFolder(given, current))
  }, [runSwitch])
  const onDropFile = (file: File) => {
    void onImportDroppedFile(file)
  }
  const foldersSupported = ports?.folders.supported === true
  return { onImportFile, onDropFile, ...(foldersSupported ? { onOpenFolder } : {}) }
}
