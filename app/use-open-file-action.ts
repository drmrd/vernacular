import { useCallback } from 'react'
import type { NotificationApi } from '../editor/design-system'
import {
  importFile,
  type FlowResult,
  type ImportedFile,
  type ImportFailure,
  type ImportResult,
} from '../session'
import { ARCHIVE_LIMITS } from '../storage'
import { importMissingAssetsText } from './asset-report-text'
import { failureMessage } from './failure-message'
import { archiveTooLargeText } from './open-failure-text'
import { loadPackSupplies } from './pack-supplies'
import type { RunFlow } from './use-open-project'
import type { ProjectActionsContext } from './use-project-actions'
import { useSwitchNotices } from './use-switch-notices'

// Reads the bytes through the file's own reader, so a file that cannot be read rejects with its
// own error. A File with no such reader (the test environment's) is read through a FileReader.
function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(new Uint8Array(reader.result as ArrayBuffer)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsArrayBuffer(file)
  })
}

// Opens a hidden file input scoped to the supported project extensions, then routes
// the first chosen file through the import callback. The picker is DOM glue; tests
// drive the import callback directly.
function openFilePicker(onFile: (file: File) => void | Promise<void>): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.building,.json,application/json'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) {
      void onFile(file)
    }
  })
  input.click()
}

/** A refusal of a file that holds no project it can open, as opposed to a file of another type. */
export type RefusedFileFailure = Exclude<ImportFailure, { readonly kind: 'unsupported-file' }>

/** A file that did not import, and the file as it was read, for an import with its repair. */
export interface RefusedFile {
  readonly failure: RefusedFileFailure
  /** Absent for a file that was refused before it was read. */
  readonly file?: ImportedFile
}

/**
 * What the import reads: the notices, the library of pack supplies, and the owner of the open
 * project. With `onRefusedFile`, a file that holds no project it can open goes there in place of
 * the notice.
 */
export type OpenFileContext = Pick<ProjectActionsContext, 'notifications' | 'packs' | 'runFlow'> & {
  readonly onRefusedFile?: ((refused: RefusedFile) => void) | undefined
}

// Shows the refusal of a file above the size limit of the archive reader, and says whether it did.
function refuseLargeFile(
  file: File,
  notifications: NotificationApi,
  onRefusedFile: OpenFileContext['onRefusedFile'],
): boolean {
  if (file.size <= ARCHIVE_LIMITS.archiveBytes) {
    return false
  }
  if (onRefusedFile !== undefined) {
    const allowed = ARCHIVE_LIMITS.archiveBytes
    onRefusedFile({ failure: { kind: 'archive-too-large', limit: 'archiveBytes', allowed } })
    return true
  }
  const reason = archiveTooLargeText('archiveBytes', ARCHIVE_LIMITS.archiveBytes)
  notifications.error(failureMessage('Open', reason))
  return true
}

/** The refusal of an import that holds no project it can open, or undefined for any other result. */
function refusedFileFailure(
  result: FlowResult<ImportFailure> | undefined,
): RefusedFileFailure | undefined {
  if (result === undefined || result.ok) {
    return undefined
  }
  const { failure } = result
  return failure.kind === 'did-not-import' || failure.kind === 'archive-too-large'
    ? failure
    : undefined
}

/** What the owner gave for the import, and the import's own result when it ran. */
interface ImportRun {
  readonly result: FlowResult<ImportFailure> | undefined
  readonly imported: ImportResult | undefined
}

/** Runs the import of the file that was read through the owner of the open project. */
async function runImport(runFlow: RunFlow, request: ImportedFile): Promise<ImportRun> {
  let imported: ImportResult | undefined
  const result = await runFlow(async (ports, current) => {
    imported = await importFile(ports, current, request)
    return imported
  })
  return { result, imported }
}

/** The file as the import reads it: its name, its bytes, and the supplies of the packs. */
async function importRequest(file: File, bytes: Uint8Array, packs: OpenFileContext['packs']) {
  const packSupplies = await loadPackSupplies(packs)
  const request: ImportedFile = {
    name: file.name,
    bytes,
    ...(packSupplies === undefined ? {} : { packSupplies }),
  }
  return request
}

// Refuses a file above the size limit before reading it, then reads the bytes of the file outside
// the flow, so a file that cannot be read shows why and runs no flow. The import then opens the
// copy under a new id and stores it. A failure shows "Open failed: " with the reason, with no
// Retry, unless the context takes the refusal of a file that holds no project it can open. An
// import that opened the project with assets missing shows one warning with the count.
export function useOpenFileAction(context: OpenFileContext): {
  onImportDroppedFile: (file: File) => Promise<void>
  onImportFile: () => void
} {
  const { notifications, packs, runFlow, onRefusedFile } = context
  const notify = useSwitchNotices()
  const importAndActivate = useCallback(
    async (file: File) => {
      if (refuseLargeFile(file, notifications, onRefusedFile)) {
        return
      }
      let bytes: Uint8Array
      try {
        bytes = await readFileBytes(file)
      } catch (error) {
        notifications.error(failureMessage('Open', error))
        return
      }
      const request = await importRequest(file, bytes, packs)
      const { result, imported } = await runImport(runFlow, request)
      const refused = refusedFileFailure(result)
      if (onRefusedFile !== undefined && refused !== undefined) {
        onRefusedFile({ failure: refused, file: request })
      } else {
        notify(result)
      }
      if (imported?.ok === true && imported.missingAssets.length > 0) {
        notifications.warning(importMissingAssetsText(imported.missingAssets.length))
      }
    },
    [runFlow, notify, notifications, packs, onRefusedFile],
  )
  return {
    onImportDroppedFile: importAndActivate,
    onImportFile: () => openFilePicker(importAndActivate),
  }
}
