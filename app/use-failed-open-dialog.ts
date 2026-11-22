import { useCallback, useMemo, useState } from 'react'
import type { RepairOffer } from '../core'
import { useNotifications, type NotificationApi } from '../editor/design-system'
import {
  importFile,
  openRepairedAsNew,
  replaceWithRepaired,
  type ImportedFile,
  type ImportResult,
  type SessionPorts,
  type SwitchFailure,
} from '../session'
import type { AssetCache } from '../storage'
import { importMissingAssetsText } from './asset-report-text'
import { createAssetLibrary } from './create-asset-library-registry'
import { failedOpenModel, type FailedOpenModel } from './failed-open-model'
import { groupedNumber } from './grouped-number'
import { loadPackSupplies, type PackCatalog } from './pack-supplies'
import type { PageNotice } from './resolve-place'
import { useOpenFileAction, type RefusedFile } from './use-open-file-action'
import type { RunFlow } from './use-open-project'

/** What the dialogs of the page run on. */
export interface FailedOpenDialogParts {
  readonly ports: SessionPorts | null
  /** The notice of a card, the start, or an address. The dialog shows it when it is of its kind. */
  readonly notice: PageNotice | undefined
  readonly runPageFlow: RunFlow
  /** Runs a flow of a page action as a try of the page. */
  readonly runActionFlow: RunFlow
  /** Clears the page's notice when a try starts. */
  readonly onTryStart: () => void
  /** The open of a card: a replace that found another stored file runs it again. */
  readonly onOpen: (id: string) => void
  /** Shows a failure of a repair choice as the failure of a try of the card. */
  readonly onChoiceFailed: (id: string, failure: SwitchFailure) => void
  /** The library whose packs supply assets. */
  readonly libraryAssets: AssetCache | null | undefined
}

/** The dialog of the page, and the actions of the page that start from a file. */
export interface FailedOpenDialogState {
  /** The failure that the dialog shows. Absent: no dialog. */
  readonly shown: ShownFailure | undefined
  readonly choice: RepairChoice
  /** Close and Escape: the dialog goes, and the page stays. */
  readonly onClose: () => void
  /** True when the notice is of the dialog's kind, so the page shows no sentence for it. */
  readonly takesNotice: boolean
  readonly onImportFile: () => void
  readonly onDropFile: (file: File) => void
}

/** A stored project that did not open, as the dialog shows it. */
interface StoredFailure {
  readonly source: 'stored'
  readonly id: string
  readonly model: FailedOpenModel
}

/** A file that did not open, with the file as it was read, when it was. */
interface FileFailure {
  readonly source: 'file'
  readonly file: ImportedFile | undefined
  readonly model: FailedOpenModel
}

/** The failure that the dialog shows, of a stored project or of a file. */
export type ShownFailure = StoredFailure | FileFailure

/** What a repair choice runs on. */
interface ChoiceContext {
  readonly runPageFlow: RunFlow
  readonly runActionFlow: RunFlow
  readonly onOpen: (id: string) => void
  readonly onChoiceFailed: (id: string, failure: SwitchFailure) => void
  readonly packs: PackCatalog | undefined
  readonly notifications: NotificationApi
}

/** The sentence for a repaired copy that lacks some of the assets its project uses. */
function repairedCopyMissingAssetsText(count: number): string {
  const lacked = `Vernacular could not find ${groupedNumber(count)} of the assets this project uses.`
  return count === 1 ? `${lacked} It shows as missing.` : `${lacked} Each one shows as missing.`
}

/** Opens the offer of a stored project as a new project, with a warning for each missing asset. */
async function openStoredCopy(id: string, offer: RepairOffer, context: ChoiceContext) {
  const packSupplies = await loadPackSupplies(context.packs)
  let missingAssets: readonly string[] = []
  const result = await context.runPageFlow(async (ports, current) => {
    const opened = await openRepairedAsNew(ports, current, {
      id,
      offer,
      ...(packSupplies === undefined ? {} : { packSupplies }),
    })
    missingAssets = opened.ok ? opened.missingAssets : []
    return opened
  })
  if (result === undefined) {
    return
  }
  if (!result.ok) {
    context.onChoiceFailed(id, result.failure)
  } else if (missingAssets.length > 0) {
    context.notifications.warning(repairedCopyMissingAssetsText(missingAssets.length))
  }
}

/** Replaces the stored project with its repair. A stored file that changed is tried again. */
async function replaceStored(id: string, offer: RepairOffer, context: ChoiceContext) {
  const result = await context.runPageFlow((ports, current) =>
    replaceWithRepaired(ports, current, { id, removedPaths: offer.removedPaths }),
  )
  if (result === undefined || result.ok) {
    return
  }
  const { failure } = result
  if (failure.kind === 'repair-changed') {
    context.onOpen(id)
  } else {
    context.onChoiceFailed(id, failure)
  }
}

/** Imports the file again with its repair, as a try of the page. */
async function openFileCopy(file: ImportedFile, context: ChoiceContext) {
  let imported: ImportResult | undefined
  const result = await context.runActionFlow(async (ports, current) => {
    imported = await importFile(ports, current, { ...file, applyRepair: true })
    return imported
  })
  if (result?.ok === true && imported?.ok === true && imported.missingAssets.length > 0) {
    context.notifications.warning(importMissingAssetsText(imported.missingAssets.length))
  }
}

/** The failure that the dialog shows: a file's, else that of the notice until it is closed. */
function useShownFailure(notice: PageNotice | undefined, build: string) {
  const [closedFailure, setClosedFailure] = useState<SwitchFailure | null>(null)
  const [refusedFile, setRefusedFile] = useState<FileFailure | null>(null)
  const storedModel = notice === undefined ? undefined : failedOpenModel(notice.failure, build)
  const stored: StoredFailure | undefined =
    notice !== undefined && storedModel !== undefined && notice.failure !== closedFailure
      ? { source: 'stored', id: notice.id, model: storedModel }
      : undefined
  const onRefusedFile = useCallback(
    ({ failure, file }: RefusedFile) => {
      const model = failedOpenModel(failure, build)
      if (model !== undefined) {
        setRefusedFile({ source: 'file', file, model })
      }
    },
    [build],
  )
  const clearFile = useCallback(() => setRefusedFile(null), [])
  const close = () => {
    if (refusedFile !== null) {
      setRefusedFile(null)
    } else if (notice !== undefined) {
      setClosedFailure(notice.failure)
    }
  }
  const shown: ShownFailure | undefined = refusedFile ?? stored
  return { shown, takesNotice: storedModel !== undefined, onRefusedFile, clearFile, close }
}

/** The choice that "Open as a new project" runs for the failure. */
function openAsNewFor(shown: ShownFailure, offer: RepairOffer, context: ChoiceContext) {
  if (shown.source === 'stored') {
    return openStoredCopy(shown.id, offer, context)
  }
  return shown.file === undefined ? Promise.resolve() : openFileCopy(shown.file, context)
}

/** The state of the choice dialog and the runs of its two choices. */
function useRepairChoice(shown: ShownFailure | undefined, context: ChoiceContext) {
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const runChoice = (choice: (shown: ShownFailure, offer: RepairOffer) => Promise<void>) => {
    const offer = shown?.model.repair
    if (shown === undefined || offer === undefined) {
      return
    }
    setBusy(true)
    void choice(shown, offer).finally(() => {
      setBusy(false)
      setChoosing(false)
    })
  }
  return {
    choosing,
    busy,
    start: () => setChoosing(true),
    cancel: () => setChoosing(false),
    openAsNew: () => runChoice((target, offer) => openAsNewFor(target, offer, context)),
    replace: () =>
      runChoice((target, offer) =>
        target.source === 'stored' ? replaceStored(target.id, offer, context) : Promise.resolve(),
      ),
  }
}

/** The state of the choice dialog, and its controls. */
export type RepairChoice = ReturnType<typeof useRepairChoice>

/** Import file and a dropped file: a file that holds no project it can open shows the dialog. */
function usePageFileActions(
  parts: FailedOpenDialogParts,
  packs: PackCatalog | undefined,
  {
    onRefusedFile,
    clearFile,
  }: Pick<ReturnType<typeof useShownFailure>, 'onRefusedFile' | 'clearFile'>,
) {
  const notifications = useNotifications()
  const { onImportFile: pickFile, onImportDroppedFile } = useOpenFileAction({
    notifications,
    runFlow: parts.runActionFlow,
    onRefusedFile,
    ...(packs === undefined ? {} : { packs }),
  })
  const { onTryStart } = parts
  const onImportFile = useCallback(() => {
    onTryStart()
    clearFile()
    pickFile()
  }, [onTryStart, clearFile, pickFile])
  const onDropFile = useCallback(
    (file: File) => {
      onTryStart()
      clearFile()
      void onImportDroppedFile(file)
    },
    [onTryStart, clearFile, onImportDroppedFile],
  )
  return { onImportFile, onDropFile }
}

/**
 * The failed-open dialog of the page and its choice dialog: for a stored project that did not
 * open at the start, on a card, or at an address, and for a file that did not import.
 */
export function useFailedOpenDialog(parts: FailedOpenDialogParts): FailedOpenDialogState {
  const { ports, notice, libraryAssets } = parts
  const failure = useShownFailure(notice, ports?.build ?? '')
  const notifications = useNotifications()
  const packs = useMemo(
    () => (libraryAssets ? createAssetLibrary(libraryAssets).registry : undefined),
    [libraryAssets],
  )
  const choice = useRepairChoice(failure.shown, { ...parts, packs, notifications })
  const fileActions = usePageFileActions(parts, packs, failure)
  const onClose = () => {
    choice.cancel()
    failure.close()
  }
  const { shown, takesNotice } = failure
  return { shown, choice, onClose, takesNotice, ...fileActions }
}
