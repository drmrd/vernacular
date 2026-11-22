import { useCallback, useMemo } from 'react'
import { useNotifications } from '../editor/design-system'
import { openFolder, type SessionPorts } from '../session'
import type { AssetCache } from '../storage'
import { createAssetLibrary } from './create-asset-library-registry'
import type { PackCatalog } from './pack-supplies'
import { useSwitchFlow } from './project-action-helpers'
import { useOpenFileAction, type RefusedFile } from './use-open-file-action'
import type { RunFlow } from './use-open-project'

/** What the actions of the Projects page run on. */
export interface PageActionsContext {
  /** Runs a flow of a page action as a try of the page. */
  readonly runActionFlow: RunFlow
  /** Clears the page's notice when a try starts. */
  readonly onTryStart: () => void
  readonly ports: SessionPorts | null
  /** The packs of the library, which supply assets for an import. */
  readonly packs: PackCatalog | undefined
  /** A file that holds no project it can open goes to the failed-open dialog. */
  readonly onRefusedFile: (refused: RefusedFile) => void
  /** Removes the dialog of the last file, when a new try of a file starts. */
  readonly clearFile: () => void
}

/** The actions of the Projects page that start from a file or a folder. */
export interface PageActions {
  readonly onImportFile: () => void
  readonly onDropFile: (file: File) => void
  /** Absent where the browser cannot open folders. */
  readonly onOpenFolder?: () => void
}

/** The packs of the library, which the import and the repair choices of the page read. */
export function useLibraryPacks(
  libraryAssets: AssetCache | null | undefined,
): PackCatalog | undefined {
  return useMemo(
    () => (libraryAssets ? createAssetLibrary(libraryAssets).registry : undefined),
    [libraryAssets],
  )
}

/**
 * Import file, a dropped file, and Open folder, run from the page as tries of the page. The click
 * or the drop clears the page's notice, and a file's try also clears the dialog of the last file.
 * A project that opens leaves the page. A file that holds no project it can open shows the
 * failed-open dialog; any other refusal shows as its toast. The page stays.
 */
export function usePageActions({
  runActionFlow,
  onTryStart,
  ports,
  packs,
  onRefusedFile,
  clearFile,
}: PageActionsContext): PageActions {
  const notifications = useNotifications()
  const { onImportFile: pickFile, onImportDroppedFile } = useOpenFileAction({
    notifications,
    runFlow: runActionFlow,
    onRefusedFile,
    ...(packs === undefined ? {} : { packs }),
  })
  const runSwitch = useSwitchFlow(runActionFlow)
  const onImportFile = useCallback(() => {
    onTryStart()
    clearFile()
    pickFile()
  }, [onTryStart, clearFile, pickFile])
  const onOpenFolder = useCallback(() => {
    onTryStart()
    void runSwitch(openFolder)
  }, [onTryStart, runSwitch])
  const onDropFile = useCallback(
    (file: File) => {
      onTryStart()
      clearFile()
      void onImportDroppedFile(file)
    },
    [onTryStart, clearFile, onImportDroppedFile],
  )
  const foldersSupported = ports?.folders.supported === true
  return { onImportFile, onDropFile, ...(foldersSupported ? { onOpenFolder } : {}) }
}
