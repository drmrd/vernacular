import { useCallback, useState } from 'react'
import type { RepairOffer } from '../core'
import { useNotifications, type NotificationApi } from '../editor/design-system'
import {
  openRepairedAsNew,
  replaceWithRepaired,
  type ImportedFile,
  type SessionPorts,
  type SwitchFailure,
} from '../session'
import { failedOpenModel, type FailedOpenModel } from './failed-open-model'
import { groupedNumber } from './grouped-number'
import { loadPackSupplies, type PackCatalog } from './pack-supplies'
import type { PageNotice } from './resolve-place'
import { importWithAssetWarning, type RefusedFile } from './use-open-file-action'
import type { RunFlow } from './use-open-project'

/** What the dialogs of the page run on. */
export interface FailedOpenDialogParts {
  readonly ports: SessionPorts | null
  /** The notice of a card, the start, or an address. The dialog shows it when it is of its kind. */
  readonly notice: PageNotice | undefined
  readonly runPageFlow: RunFlow
  /** Runs a flow of a page action as a try of the page. */
  readonly runActionFlow: RunFlow
  /** The open of a card: a replace that found another stored file runs it again. */
  readonly onOpen: (id: string) => void
  /** Shows a failure of a repair choice as the failure of a try of the card. */
  readonly onTryFailed: (id: string, failure: SwitchFailure) => void
  /** The packs of the library, which supply assets. */
  readonly packs: PackCatalog | undefined
}

/** The dialog of the page, and the way a file that did not import comes to it. */
export interface FailedOpenDialogState {
  /** The failure that the dialog shows. Absent: no dialog. */
  readonly shown: ShownFailure | undefined
  readonly choice: RepairChoice
  /** Close and Escape: the dialog goes, and the page stays. */
  readonly onClose: () => void
  /** True when the notice is of the dialog's kind, so the page shows no sentence for it. */
  readonly takesNotice: boolean
  /** A file that holds no project it can open: the dialog shows it. */
  readonly onRefusedFile: (refused: RefusedFile) => void
  /** The dialog of a file goes, when a new try of a file starts. */
  readonly clearFile: () => void
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
type ChoiceContext = Pick<
  FailedOpenDialogParts,
  'runPageFlow' | 'runActionFlow' | 'onOpen' | 'onTryFailed' | 'packs'
> & { readonly notifications: NotificationApi; readonly clearFile: () => void }

/** The run of a choice with the offered repair. */
type ChoiceRun = (offer: RepairOffer) => Promise<void>

/** The sentence for a repaired copy that lacks some of the assets its project uses. */
function repairedCopyMissingAssetsText(count: number): string {
  const lacked = `Vernacular could not find ${groupedNumber(count)} of the assets this project uses.`
  return count === 1 ? `${lacked} It shows as missing.` : `${lacked} They show as missing.`
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
    context.onTryFailed(id, result.failure)
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
    context.onTryFailed(id, failure)
  }
}

/** Imports the file again with its repair, as a try of the page. A failed try clears the file. */
async function openFileCopy(file: ImportedFile, context: ChoiceContext) {
  const request = { ...file, applyRepair: true }
  const result = await importWithAssetWarning(context.runActionFlow, request, context.notifications)
  if (result === undefined || !result.ok) {
    context.clearFile()
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

/**
 * The run of "Open as a new project" for the failure. A file that was refused before it was read
 * has no repair to offer, so it has no run.
 */
function openAsNewFor(shown: ShownFailure, context: ChoiceContext): ChoiceRun | undefined {
  if (shown.source === 'stored') {
    return (offer) => openStoredCopy(shown.id, offer, context)
  }
  const { file } = shown
  return file === undefined ? undefined : () => openFileCopy(file, context)
}

/** The run of "Replace the stored project". Only a stored project has one. */
function replaceFor(shown: ShownFailure, context: ChoiceContext): ChoiceRun | undefined {
  return shown.source === 'stored' ? (offer) => replaceStored(shown.id, offer, context) : undefined
}

/** The state of the choice dialog and the runs of its two choices. A choice runs one at a time. */
function useRepairChoice(shown: ShownFailure | undefined, context: ChoiceContext) {
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const runChoice = (
    runFor: (target: ShownFailure, context: ChoiceContext) => ChoiceRun | undefined,
  ) => {
    const offer = shown?.model.repair
    const run = shown === undefined ? undefined : runFor(shown, context)
    if (busy || offer === undefined || run === undefined) {
      return
    }
    setBusy(true)
    void run(offer).finally(() => {
      setBusy(false)
      setChoosing(false)
    })
  }
  return {
    choosing,
    busy,
    start: () => setChoosing(true),
    cancel: () => setChoosing(false),
    openAsNew: () => runChoice(openAsNewFor),
    replace: () => runChoice(replaceFor),
  }
}

/** The state of the choice dialog, and its controls. */
export type RepairChoice = ReturnType<typeof useRepairChoice>

/**
 * The failed-open dialog of the page and its choice dialog: for a stored project that did not
 * open at the start, on a card, or at an address, and for a file that did not import.
 */
export function useFailedOpenDialog(parts: FailedOpenDialogParts): FailedOpenDialogState {
  const { ports, notice, runPageFlow, runActionFlow, onOpen, onTryFailed, packs } = parts
  const failure = useShownFailure(notice, ports?.build ?? '')
  const notifications = useNotifications()
  const choice = useRepairChoice(failure.shown, {
    ...{ runPageFlow, runActionFlow, onOpen, onTryFailed, packs },
    notifications,
    clearFile: failure.clearFile,
  })
  const onClose = () => {
    choice.cancel()
    failure.close()
  }
  const { shown, takesNotice, onRefusedFile, clearFile } = failure
  return { shown, choice, onClose, takesNotice, onRefusedFile, clearFile }
}
