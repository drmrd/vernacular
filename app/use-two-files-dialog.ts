import { useCallback, useState } from 'react'
import type { TwoFilesDialogProps } from '../editor/projects'
import {
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
import { openFailureReason } from './open-failure-text'
import type { HistoryNavigation } from './use-history-navigation'

/** What the dialog of the two plan files runs on. */
export interface TwoFilesDialogParts {
  readonly ports: SessionPorts | null
  readonly navigation: Pick<HistoryNavigation, 'runPageAction' | 'runPageFlow'>
  /** The start of a choice clears the page's sentence. */
  readonly onActionStart: () => void
  /** The end of a choice: the sentence to show, or null. The page reads the cards again. */
  readonly onActionEnd: (notice: string | null) => void
}

/** The dialog of the page and the card action that shows it. Absent `dialog`: no dialog. */
export interface TwoFilesDialogState {
  readonly dialog: TwoFilesDialogProps | undefined
  readonly onChooseFile: (id: string) => void
}

/** The project and the two files as the dialog shows them. */
interface Shown {
  readonly id: string
  readonly files: TwoDocumentFiles
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
const NOTHING_CHANGED: Answer = { ok: false, failure: { kind: 'files-changed' } }

const SECOND_FILE_UNREADABLE = 'The second plan file could not be read.'

/**
 * The sentence of a failure. The switch names every kind of refusal of the second file and sends
 * the kinds of a failed switch to their own sentences, so a new refusal is a type error here.
 */
function failureSentence(failure: SwitchFailure | KeptFileRefusal): string {
  switch (failure.kind) {
    case 'files-changed':
    case 'no-second-file':
    case 'second-file-unreadable':
      return SECOND_FILE_UNREADABLE
    default:
      return `Could not change the plan files: ${openFailureReason(failure)}`
  }
}

function readFacts(ports: SessionPorts | null, id: string): Promise<TwoFilesRead> {
  return ports === null ? Promise.resolve(NO_SECOND_FILE) : readTwoFiles(ports, id)
}

/** The new project is the one that shows, so the choice runs as a flow of the page. */
async function openAsNew(navigation: PageRunners, choice: KeptFileChoice): Promise<Answer> {
  const result = await navigation.runPageFlow<KeptFileRefusal>((ports, current) =>
    openSecondFileAsNew(ports, current, choice),
  )
  return result ?? NOTHING_CHANGED
}

/** A flow of the session that changes the stored files and may open the project again. */
type StoredFilesChange = (
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  choice: KeptFileChoice,
) => Promise<KeptFileResult>

/**
 * A choice that changes the stored files and opens no other project. When this tab held the
 * project, the flow opened it again. The page shows no editor then, so that handle closes at once.
 */
async function changeStoredFiles(
  navigation: PageRunners,
  change: StoredFilesChange,
  choice: KeptFileChoice,
): Promise<Answer> {
  const outcome = await navigation.runPageAction(async (ports, current) => {
    const result = await change(ports, current, choice)
    const currentClosed = result.handle !== current
    const reopened = currentClosed ? result.handle : undefined
    await reopened?.close()
    return { result, currentClosed }
  })
  return outcome?.result ?? NOTHING_CHANGED
}

/** The three choices of the dialog, each run on the files as the dialog showed them. */
interface Choices {
  readonly openAsNew: ChoiceRun
  readonly replace: ChoiceRun
  readonly remove: ChoiceRun
}

function choicesOn(navigation: PageRunners): Choices {
  return {
    openAsNew: (choice) => openAsNew(navigation, choice),
    replace: (choice) => changeStoredFiles(navigation, replaceWithSecondFile, choice),
    remove: (choice) => changeStoredFiles(navigation, removeSecondFile, choice),
  }
}

/** The state of a running choice, and the run of a choice with the page around it. */
function useChoose(
  { ports, navigation, onActionStart, onActionEnd }: TwoFilesDialogParts,
  show: (id: string, read: TwoFilesRead) => void,
  close: () => void,
) {
  const [busy, setBusy] = useState(false)
  const choose = async ({ id, files }: Shown, run: ChoiceRun) => {
    onActionStart()
    setBusy(true)
    const answer = await run({ id, files }).finally(() => setBusy(false))
    if (!answer.ok && answer.failure.kind === 'files-changed') {
      show(id, await readFacts(ports, id))
      return
    }
    close()
    onActionEnd(answer.ok ? null : failureSentence(answer.failure))
  }
  return { busy, choose, choices: choicesOn(navigation) }
}

/** The props of the dialog for the files that it shows. Remove exists only with both readable. */
function dialogPropsOf(
  { files }: Shown,
  controls: Required<
    Pick<TwoFilesDialogProps, 'onKeepBoth' | 'onOpenAsNew' | 'onReplace' | 'onRemove'>
  >,
  busy: boolean,
): TwoFilesDialogProps {
  const { onRemove, ...always } = controls
  return {
    ...always,
    state: files.state,
    secondFileName: files.second.name,
    mainChangedAt: files.main.changedAt,
    secondChangedAt: files.second.changedAt,
    busy,
    ...(files.state === 'both-readable' ? { onRemove } : {}),
  }
}

/**
 * The dialog that offers the choice between the two plan files of a project, and the card action
 * that shows it. A choice runs one at a time. A choice that finds the files changed shows the
 * dialog again with the files as they are now, or closes it when no second file is left.
 */
export function useTwoFilesDialog(parts: TwoFilesDialogParts): TwoFilesDialogState {
  const { ports, onActionStart, onActionEnd } = parts
  const [shown, setShown] = useState<Shown | undefined>(undefined)
  const show = useCallback(
    (id: string, read: TwoFilesRead) => {
      if (read.ok && read.files !== undefined) {
        setShown({ id, files: read.files })
      } else {
        setShown(undefined)
        onActionEnd(read.ok ? null : failureSentence(read.failure))
      }
    },
    [onActionEnd],
  )
  const onChooseFile = useCallback(
    (id: string) => {
      onActionStart()
      void readFacts(ports, id).then((read) => show(id, read))
    },
    [ports, onActionStart, show],
  )
  const close = useCallback(() => setShown(undefined), [])
  const { busy, choose, choices } = useChoose(parts, show, close)
  const dialog =
    shown &&
    dialogPropsOf(
      shown,
      {
        onKeepBoth: close,
        onOpenAsNew: () => void choose(shown, choices.openAsNew),
        onReplace: () => void choose(shown, choices.replace),
        onRemove: () => void choose(shown, choices.remove),
      },
      busy,
    )
  return { dialog, onChooseFile }
}
