import type { NotificationApi } from '../editor/design-system'
import {
  openKeepingBothFiles,
  openSecondFileAsNew,
  removeSecondFile,
  replaceWithSecondFile,
  type DocumentHandle,
  type KeptFileChoice,
  type KeptFileRefusal,
  type KeptFileResult,
  type SessionPorts,
  type SwitchFailure,
} from '../session'
import { missingAssetsText } from './open-failure-text'
import type { HistoryNavigation } from './use-history-navigation'
import type { FlowOutcome } from './use-open-project'

/** What a choice gave: it went through, or why the stored files stay as they are. */
export type Answer =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly failure: SwitchFailure | KeptFileRefusal
      /** True when the stored files were changed and only the open after the change failed. */
      readonly done?: true
    }

/** One choice of the dialog, run on the files as the dialog showed them. */
export type ChoiceRun = (choice: KeptFileChoice) => Promise<Answer>

/** The runs of the page that a choice goes through. */
export type PageRunners = Pick<HistoryNavigation, 'runPageAction' | 'runPageFlow'>

/** Another step of the page runs, so nothing was changed: the dialog reads the files again. */
const NOTHING_CHANGED = { ok: false, failure: { kind: 'files-changed' } } as const

/**
 * A flow that opens the project always gives the handle that it opened, so a result without one
 * does not happen. It reads as a change of the files, which makes the dialog read them again.
 */
const OPENED_NO_PROJECT = NOTHING_CHANGED

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
  if (!result.ok) {
    return result
  }
  return result.handle === undefined ? OPENED_NO_PROJECT : { ok: true, handle: result.handle }
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
 * A choice that changes the stored files and leaves the page where it is. When this tab held the
 * project, the flow opened it again, and the owner takes that handle in place of the one it ended.
 */
async function changeStoredFiles(
  navigation: PageRunners,
  change: StoredFilesChange,
  choice: KeptFileChoice,
): Promise<Answer> {
  const outcome = await navigation.runPageAction(async (ports, current) => {
    const result = await change(ports, current, choice)
    return { result, currentClosed: result.handle !== current, reopened: result.handle }
  })
  return outcome?.result ?? NOTHING_CHANGED
}

/** The run of a change of the stored files: before an open it opens the project, else it stays. */
function changing(navigation: PageRunners, change: StoredFilesChange): ChoiceRun {
  return (choice) =>
    choice.open === true
      ? changeAndOpen(navigation, change, choice)
      : changeStoredFiles(navigation, change, choice)
}

/** The four choices of the dialog, each run on the files as the dialog showed them. */
export interface Choices {
  readonly openKeepingBoth: ChoiceRun
  readonly openAsNew: ChoiceRun
  readonly replace: ChoiceRun
  readonly remove: ChoiceRun
}

export function choicesOn(navigation: PageRunners, notifications: NotificationApi): Choices {
  return {
    openKeepingBoth: (choice) => openMainFile(navigation, choice),
    openAsNew: (choice) => openAsNew(navigation, notifications, choice),
    replace: changing(navigation, replaceWithSecondFile),
    remove: changing(navigation, removeSecondFile),
  }
}
