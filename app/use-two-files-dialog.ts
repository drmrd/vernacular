import { useCallback, useState } from 'react'
import { useNotifications } from '../editor/design-system'
import type { TwoFilesDialogProps } from '../editor/projects'
import {
  readTwoFiles,
  type KeptFileRefusal,
  type SessionPorts,
  type SwitchFailure,
  type TwoFilesRead,
} from '../session'
import type { TwoDocumentFiles } from '../storage'
import { openFailureReason } from './open-failure-text'
import type { PageNotice } from './resolve-place'
import { choicesOn, type ChoiceRun, type PageRunners } from './two-files-dialog-choices'

/** What the dialog of the two plan files runs on. */
export interface TwoFilesDialogParts {
  readonly ports: SessionPorts | null
  readonly navigation: PageRunners
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

const NO_SECOND_FILE: TwoFilesRead = { ok: true, files: undefined }

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

/** The state of a running choice, and the run of a choice with the page around it. */
function useChoose(
  { ports, navigation, onActionStart, onActionEnd }: TwoFilesDialogParts,
  { hold, show, close }: Pick<ShownFiles, 'hold' | 'show' | 'close'>,
) {
  const notifications = useNotifications()
  const [busy, setBusy] = useState(false)
  const choose = async (shown: Shown, run: ChoiceRun) => {
    const { id, files, open } = shown
    hold(shown)
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

/** The failure of two plan files that a notice carries, with the files as the dialog shows them. */
function twoFilesOf(
  notice: PageNotice | undefined,
): { readonly failure: SwitchFailure; readonly shown: Shown } | undefined {
  const failure = notice?.failure
  return notice !== undefined && failure?.kind === 'two-files'
    ? { failure, shown: { id: notice.id, files: failure.files, open: true } }
    : undefined
}

/**
 * The dialog's files: those of a failure of two plan files in the notice until the dialog holds
 * them or closes. A choice clears the notice while it runs, so it holds the files it runs on.
 */
function useShownFiles(
  notice: PageNotice | undefined,
  onActionEnd: TwoFilesDialogParts['onActionEnd'],
) {
  const [held, setHeld] = useState<Shown | undefined>(undefined)
  const [takenFailure, setTakenFailure] = useState<SwitchFailure | null>(null)
  const fromNotice = twoFilesOf(notice)
  const noticeFailure = fromNotice?.failure
  const hold = useCallback(
    (next: Shown | undefined) => {
      setHeld(next)
      if (noticeFailure !== undefined) {
        setTakenFailure(noticeFailure)
      }
    },
    [noticeFailure],
  )
  const close = useCallback(() => hold(undefined), [hold])
  const show = useCallback(
    ({ id, open }: Pick<Shown, 'id' | 'open'>, read: TwoFilesRead) => {
      if (read.ok && read.files !== undefined) {
        hold({ id, files: read.files, open })
      } else {
        close()
        onActionEnd(read.ok ? null : failureSentence(read.failure))
      }
    },
    [hold, close, onActionEnd],
  )
  const untaken = fromNotice !== undefined && fromNotice.failure !== takenFailure
  return { shown: untaken ? fromNotice.shown : held, hold, show, close }
}

type ShownFiles = ReturnType<typeof useShownFiles>

/**
 * The dialog that offers the choice between the two plan files of a project, and the card action
 * that shows it. A failure of two plan files at a start, a card, or an address shows it before the
 * open. A choice runs one at a time. A choice that finds the files changed shows the dialog again
 * with the files as they are now, or closes it when no second file is left.
 */
export function useTwoFilesDialog(parts: TwoFilesDialogParts): TwoFilesDialogState {
  const { ports, notice, onActionStart, onActionEnd } = parts
  const shownFiles = useShownFiles(notice, onActionEnd)
  const { shown, show, close } = shownFiles
  const onChooseFile = useCallback(
    (id: string) => {
      onActionStart()
      void readFacts(ports, id).then((read) => show({ id, open: false }, read))
    },
    [ports, onActionStart, show],
  )
  const { busy, choose, choices } = useChoose(parts, shownFiles)
  const dialog =
    shown &&
    dialogPropsOf(
      shown,
      {
        onKeepBoth: shown.open ? () => void choose(shown, choices.openKeepingBoth) : close,
        onOpenAsNew: () => void choose(shown, choices.openAsNew),
        onReplace: () => void choose(shown, choices.replace),
        onRemove: () => void choose(shown, choices.remove),
        onCancel: close,
      },
      busy,
    )
  return { dialog, onChooseFile, takesNotice: twoFilesOf(notice) !== undefined }
}
