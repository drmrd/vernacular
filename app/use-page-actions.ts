import { useCallback, useMemo } from 'react'
import { useNotifications } from '../editor/design-system'
import { openFolder, type SessionPorts } from '../session'
import type { AssetCache } from '../storage'
import { createAssetLibrary } from './create-asset-library-registry'
import { useSwitchFlow } from './project-action-helpers'
import { useOpenFileAction } from './use-open-file-action'
import type { RunFlow } from './use-open-project'

/** What the actions of the Projects page run on. */
export interface PageActionsContext {
  /** Runs a flow of a page action as a try of the page. */
  readonly runActionFlow: RunFlow
  /** Clears the page's notice when a try starts. */
  readonly onTryStart: () => void
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
 * Import file, a dropped file, and Open folder, run from the page as tries of the page. The click
 * or the drop clears the page's notice. A project that opens leaves the page. A refusal shows as
 * the toast that the editor shows for it, and the page stays.
 */
export function usePageActions({
  runActionFlow,
  onTryStart,
  ports,
  libraryAssets,
}: PageActionsContext): PageActions {
  const notifications = useNotifications()
  const packs = useMemo(
    () => (libraryAssets ? createAssetLibrary(libraryAssets).registry : undefined),
    [libraryAssets],
  )
  const { onImportFile: pickFile, onImportDroppedFile } = useOpenFileAction({
    notifications,
    runFlow: runActionFlow,
    ...(packs === undefined ? {} : { packs }),
  })
  const runSwitch = useSwitchFlow(runActionFlow)
  const onImportFile = () => {
    onTryStart()
    pickFile()
  }
  const onOpenFolder = useCallback(() => {
    onTryStart()
    void runSwitch(openFolder)
  }, [onTryStart, runSwitch])
  const onDropFile = useCallback(
    (file: File) => {
      onTryStart()
      void onImportDroppedFile(file)
    },
    [onTryStart, onImportDroppedFile],
  )
  const foldersSupported = ports?.folders.supported === true
  return { onImportFile, onDropFile, ...(foldersSupported ? { onOpenFolder } : {}) }
}
