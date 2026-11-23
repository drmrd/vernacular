import { useCallback, useState } from 'react'
import { useNotifications, type NotificationApi } from '../editor/design-system'
import type { TwoFilesDialogProps } from '../editor/projects'
import {
  openKeepingBothFiles,
  openSecondFileAsNew,
  readTwoFiles,
  removeSecondFile,
  replaceWithSecondFile,
  type DocumentHandle,
  type KeptFileChoice,
  type KeptFileRefusal,
  type KeptFileResult,
  type SessionPorts,
  type SwitchFailure,
  type TwoFilesRead,
} from '../session'
import type { TwoDocumentFiles } from '../storage'
import { missingAssetsText, openFailureReason } from './open-failure-text'
import type { PageNotice } from './resolve-place'
import type { HistoryNavigation } from './use-history-navigation'
import type { FlowOutcome } from './use-open-project'

/** What the dialog of the two plan files runs on. */
export interface TwoFilesDialogParts {
  readonly ports: SessionPorts | null
  readonly navigation: Pick<HistoryNavigation, 'runPageAction' | 'runPageFlow'>
  /** The start of a choice clears the page's sentence. */
  readonly onActionStart: () => void
  /** The end of a choice: the sentence to show, or null. The page reads the cards again. */
  readonly onActionEnd: (notice: string | null) => void
  /** The notice of a card, the start, or an address. A failure of two plan files shows the dialog. */
  readonly notice: PageNotice | undefined
}

/** The dialog of the page and the card action that shows it. Absent `dialog`: no dialog. */
export interface TwoFilesDialogState {
  readonly dialog: TwoFilesDialogProps | undefined
  readonly onChooseFile: (id: string) => void
  /** True when the notice is a failure of two plan files, so the page shows no sentence for it. */
  readonly takesNotice: boolean
}

/** The project and the two files as the dialog shows them. */
interface Shown {
  readonly id: string
  readonly files: TwoDocumentFiles
  /** True when the dialog shows before an open: a choice that goes through opens the project. */
  readonly open: boolean
}

/** What a choice gave: it went through, or why the stored files stay as they are. */
type Answer =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: SwitchFailure | KeptFileRefusal }

/** One choice of the dialog, run on the files as the dialog showed them. */
type ChoiceRun = (choice: KeptFileChoice) => Promise<Answer>

type PageRunners = TwoFilesDialogParts['navigation']

const NO_SECOND_FILE: TwoFilesRead = { ok: true, files: undefined }

/** Another step of the page runs, so nothing was changed: the dialog reads the files again. */
const NOTHING_CHANGED = { ok: false, failure: { kind: 'files-changed' } } as const

const SECOND_FILE_UNREADABLE = 'The second plan file could not be read.'

/**
 * The reason of a failure. The switch names every kind of refusal of the second file and sends
 * the kinds of a failed switch to their own reasons, so a new refusal is a type error here.
 */
function failureReason(failure: SwitchFailure | KeptFileRefusal): string {
  switch (failure.kind) {
    case 'files-changed':
    case 'no-second-file':
    case 'second-file-unreadable':
      return SECOND_FILE_UNREADABLE
    default:
      return openFailureReason(failure)
  }
}

function failureSentence(failure: SwitchFailure | KeptFileRefusal): string {
  return `Could not change the plan files: ${failureReason(failure)}`
}

function readFacts(ports: SessionPorts | null, id: string): Promise<TwoFilesRead> {
  return ports === null ? Promise.resolve(NO_SECOND_FILE) : readTwoFiles(ports, id)
}

/** Opens the main file and leaves both files, as a flow of the page. */
async function openMainFile(navigation: PageRunners, choice: KeptFileChoice): Promise<Answer> {
  const result = await navigation.runPageFlow((ports, current) =>
    openKeepingBothFiles(ports, current, choice.id),
  )
  return result ?? NOTHING_CHANGED
}

/**
 * The new project is the one that shows, so the choice runs as a flow of the page. A new project
 * that lacks assets shows a warning.
 */
async function openAsNew(
  navigation: PageRunners,
  notifications: NotificationApi,
  choice: KeptFileChoice,
): Promise<Answer> {
  let missingAssets: readonly string[] = []
  const result = await navigation.runPageFlow<KeptFileRefusal>(async (ports, current) => {
    const opened = await openSecondFileAsNew(ports, current, choice)
    missingAssets = opened.ok ? opened.missingAssets : []
    return opened
  })
  if (result?.ok === true && missingAssets.length > 0) {
    notifications.warning(missingAssetsText(missingAssets.length))
  }
  return result ?? NOTHING_CHANGED
}

/** A flow of the session that changes the stored files and may open the project again. */
type StoredFilesChange = (
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  choice: KeptFileChoice,
) => Promise<KeptFileResult>

/** The flow result of a choice made before an open, which holds the project that it opened. */
function openedOutcome(result: KeptFileResult): FlowOutcome<KeptFileRefusal> {
  return result.ok ? openedWith(result.handle) : result
}

function openedWith(handle: DocumentHandle | undefined): FlowOutcome<KeptFileRefusal> {
  return handle === undefined ? NOTHING_CHANGED : { ok: true, handle }
}

/** A choice made before an open opens the project, so the page leaves when it goes through. */
async function changeAndOpen(
  navigation: PageRunners,
  change: StoredFilesChange,
  choice: KeptFileChoice,
): Promise<Answer> {
  const result = await navigation.runPageFlow<KeptFileRefusal>(async (ports, current) =>
    openedOutcome(await change(ports, current, choice)),
  )
  return result ?? NOTHING_CHANGED
}

/**
 * A choice that changes the stored files and opens no other project. When this tab held the
 * project, the flow opened it again, and the owner takes that handle in place of the one it ended.
 */
async function changeStoredFiles(
  navigation: PageRunners,
  change: StoredFilesChange,
  choice: KeptFileChoice,
): Promise<Answer> {
  if (choice.open === true) {
    return changeAndOpen(navigation, change, choice)
  }
  const outcome = await navigation.runPageAction(async (ports, current) => {
    const result = await change(ports, current, choice)
    return { result, currentClosed: result.handle !== current, reopened: result.handle }
  })
  return outcome?.result ?? NOTHING_CHANGED
}

/** The three choices of the dialog, each run on the files as the dialog showed them. */
interface Choices {
  readonly keepBoth: ChoiceRun
  readonly openAsNew: ChoiceRun
  readonly replace: ChoiceRun
  readonly remove: ChoiceRun
}

function choicesOn(navigation: PageRunners, notifications: NotificationApi): Choices {
  return {
    keepBoth: (choice) => openMainFile(navigation, choice),
    openAsNew: (choice) => openAsNew(navigation, notifications, choice),
    replace: (choice) => changeStoredFiles(navigation, replaceWithSecondFile, choice),
    remove: (choice) => changeStoredFiles(navigation, removeSecondFile, choice),
  }
}

/** The state of a running choice, and the run of a choice with the page around it. */
function useChoose(
  { ports, navigation, onActionStart, onActionEnd }: TwoFilesDialogParts,
  show: (shown: Pick<Shown, 'id' | 'open'>, read: TwoFilesRead) => void,
  close: () => void,
) {
  const notifications = useNotifications()
  const [busy, setBusy] = useState(false)
  const choose = async ({ id, files, open }: Shown, run: ChoiceRun) => {
    onActionStart()
    setBusy(true)
    const answer = await run({ id, files, open }).finally(() => setBusy(false))
    if (!answer.ok && answer.failure.kind === 'files-changed') {
      show({ id, open }, await readFacts(ports, id))
      return
    }
    close()
    onActionEnd(answer.ok ? null : failureSentence(answer.failure))
  }
  return { busy, choose, choices: choicesOn(navigation, notifications) }
}

/**
 * The props of the dialog for the files that it shows. Remove exists only with both readable.
 * Before an open, the primary control opens the project and Cancel shows.
 */
function dialogPropsOf(
  { files, open }: Shown,
  controls: Required<
    Pick<TwoFilesDialogProps, 'onKeepBoth' | 'onOpenAsNew' | 'onReplace' | 'onRemove' | 'onCancel'>
  >,
  busy: boolean,
): TwoFilesDialogProps {
  const { onRemove, onCancel, ...always } = controls
  return {
    ...always,
    state: files.state,
    secondFileName: files.second.name,
    mainChangedAt: files.main.changedAt,
    secondChangedAt: files.second.changedAt,
    busy,
    ...(files.state === 'both-readable' ? { onRemove } : {}),
    ...(open ? { beforeOpen: true, onCancel } : {}),
  }
}

/** The dialog's files, shown from a card action or adopted from a failure of two plan files. */
function useShownFiles(
  notice: PageNotice | undefined,
  onActionEnd: TwoFilesDialogParts['onActionEnd'],
) {
  const [shown, setShown] = useState<Shown | undefined>(undefined)
  const [adopted, setAdopted] = useState<SwitchFailure | null>(null)
  const failure = notice?.failure
  if (notice !== undefined && failure?.kind === 'two-files' && failure !== adopted) {
    setAdopted(failure)
    setShown({ id: notice.id, files: failure.files, open: true })
  }
  const close = useCallback(() => setShown(undefined), [])
  const show = useCallback(
    ({ id, open }: Pick<Shown, 'id' | 'open'>, read: TwoFilesRead) => {
      if (read.ok && read.files !== undefined) {
        setShown({ id, files: read.files, open })
      } else {
        close()
        onActionEnd(read.ok ? null : failureSentence(read.failure))
      }
    },
    [close, onActionEnd],
  )
  return { shown, show, close }
}

/**
 * The dialog that offers the choice between the two plan files of a project, and the card action
 * that shows it. A failure of two plan files at a start, a card, or an address shows it before the
 * open. A choice runs one at a time. A choice that finds the files changed shows the dialog again
 * with the files as they are now, or closes it when no second file is left.
 */
export function useTwoFilesDialog(parts: TwoFilesDialogParts): TwoFilesDialogState {
  const { ports, notice, onActionStart, onActionEnd } = parts
  const { shown, show, close } = useShownFiles(notice, onActionEnd)
  const onChooseFile = useCallback(
    (id: string) => {
      onActionStart()
      void readFacts(ports, id).then((read) => show({ id, open: false }, read))
    },
    [ports, onActionStart, show],
  )
  const { busy, choose, choices } = useChoose(parts, show, close)
  const dialog =
    shown &&
    dialogPropsOf(
      shown,
      {
        onKeepBoth: shown.open ? () => void choose(shown, choices.keepBoth) : close,
        onOpenAsNew: () => void choose(shown, choices.openAsNew),
        onReplace: () => void choose(shown, choices.replace),
        onRemove: () => void choose(shown, choices.remove),
        onCancel: close,
      },
      busy,
    )
  return { dialog, onChooseFile, takesNotice: notice?.failure.kind === 'two-files' }
}
