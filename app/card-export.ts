import { useMemo } from 'react'
import { useNotifications, type NotificationApi } from '../editor/design-system'
import {
  UNNAMED_PROJECT,
  exportProject,
  type DocumentHandle,
  type ProjectCardModel,
  type SessionPorts,
} from '../session'
import { bundleFilename, downloadBytes } from '../storage'
import { exportMissingAssetsText } from './asset-report-text'
import { exportFailureText, uncheckedCopyText } from './card-action-text'
import { loadPackSupplies, type LibraryLister } from './pack-supplies'
import { runExportWithToast } from './use-export-actions'

/** What an export from a card runs on. */
export interface CardExportParts {
  readonly ports: SessionPorts | null
  /** The project open in this tab, read when the export starts. */
  readonly handle: DocumentHandle | null
  /** The cards on the page, which name the projects that are not open. */
  readonly cards?: readonly ProjectCardModel[] | undefined
  /** The lister of the library whose packs supply assets, so that those assets do not count as missing. */
  readonly library?: LibraryLister | undefined
}

/** The file that the export of the id is expected to make, for the toast until the file exists. */
function expectedFileName(
  cards: readonly ProjectCardModel[] | undefined,
  handle: DocumentHandle | undefined,
  id: string,
): string {
  const shown = handle?.id === id ? handle.session.getProject().meta.name : undefined
  const card = cards?.find((candidate) => candidate.id === id)
  return bundleFilename(shown ?? card?.name ?? UNNAMED_PROJECT)
}

/** What one export runs on. */
interface ExportRun {
  readonly ports: SessionPorts
  readonly handle: DocumentHandle | undefined
  readonly id: string
  readonly notifications: NotificationApi
  readonly packs: LibraryLister | undefined
}

/**
 * Runs the export of the id and hands its file to the download, with the warnings it earns.
 * Resolves with the name of the file.
 */
async function exportAndDownload(
  { ports, handle, id, notifications, packs }: ExportRun,
  onProgress: (completed: number, total: number) => void,
): Promise<string> {
  const result = await exportProject(ports, handle, {
    id,
    onProgress,
    loadPackSupplies: () => loadPackSupplies(packs),
  })
  if (!result.ok) {
    throw new Error(exportFailureText(result.failure))
  }
  downloadBytes(result.bytes, result.fileName)
  if (result.kind === 'unchecked-copy') {
    notifications.warning(uncheckedCopyText(result.includedAssets))
  } else if (result.missingAssets.length > 0) {
    notifications.warning(exportMissingAssetsText(result.missingAssets.length))
  }
  return result.fileName
}

/**
 * The export of a card: a toast that follows the export, then the download. It runs outside the
 * navigation's runner, so it works while another step runs. Absent while there are no ports.
 */
export function useCardExport({
  ports,
  handle,
  cards,
  library,
}: CardExportParts): ((id: string) => void) | undefined {
  const notifications = useNotifications()
  return useMemo(
    () =>
      ports === null
        ? undefined
        : (id: string): void => {
            const current = handle ?? undefined
            runExportWithToast(notifications, expectedFileName(cards, current, id), (onProgress) =>
              exportAndDownload(
                { ports, handle: current, id, notifications, packs: library },
                onProgress,
              ),
            )
          },
    [ports, handle, cards, notifications, library],
  )
}
