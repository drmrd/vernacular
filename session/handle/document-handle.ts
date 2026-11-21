import type { DocumentStore, ProjectLockHold, ProjectSnapshots, SaveReport } from '../../storage'
import { type Autosave, createAutosave } from '../autosave/create-autosave'
import { createEditorSession, type EditorSession } from '../editor-session/editor-session'
import { callGuarded, callGuardedAsync } from '../guarded-call'
import { type HandOver, registerHandle } from './handle-internals'
import { createHandleNotices, type HandleNotices } from './handle-notices'
import type { RecordKeeper } from './handle-record'
import { createStoredFlag, type StoredFlag } from './handle-stored'
import type { DocumentHandle, OpenRequest, SaveOutcome, SaveStatus } from './handle-types'
import type { OpenedProject } from './read-for-open'
import { markSession } from './session-mark'
import { messageOf } from './thrown-failures'

/** What an open found, from which a handle is built. */
export interface DocumentHandleParts {
  readonly request: OpenRequest
  readonly store: DocumentStore
  readonly hold: ProjectLockHold
  readonly opened: OpenedProject
  /** A session built ahead on the opened project; when absent, the handle builds its own. */
  readonly session?: EditorSession
  /**
   * The snapshots of the request's id on the store, obtained ahead; when absent, the handle asks
   * the store for them. After a restore, the closed old handle and the new handle share one
   * snapshots object, which is safe because that object holds no state of a session.
   */
  readonly snapshots?: ProjectSnapshots
  /** True: the autosave writes no recovery snapshot and removes none. `snapshots` is unchanged. */
  readonly leaveSnapshots?: boolean
  /** The record writes of the project; a restore passes on those of the handle before it. */
  readonly records: RecordKeeper
  /**
   * True when the store held the project at the open; a restore passes on the answer of the handle
   * before it. Absent means false.
   */
  readonly stored?: boolean
}

interface SaveStatusCell {
  get(): SaveStatus
  set(status: SaveStatus): void
  subscribe(listener: () => void): () => void
}

const SAVED: SaveOutcome = { ok: true }

type SaveFailed = Extract<SaveOutcome, { readonly ok: false }>

/** The message of a save or a flush asked of a handle that has closed. */
const CLOSED_OUTCOME: SaveFailed = {
  ok: false,
  message: 'The project is closed, so nothing was saved.',
}

/** The save status, which tells its listeners of each new value and of no repeated one. */
function createSaveStatusCell(): SaveStatusCell {
  let status: SaveStatus = 'idle'
  const listeners = new Set<() => void>()
  return {
    get: () => status,
    set(next) {
      if (next === status) {
        return
      }
      status = next
      for (const listener of [...listeners]) {
        callGuarded(listener)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function failedWith(error: unknown): SaveOutcome {
  return { ok: false, message: messageOf(error) }
}

/** What a handle saves, flushes, and closes with. */
interface SavePathParts {
  readonly autosave: Autosave
  readonly hold: ProjectLockHold
  readonly records: RecordKeeper
}

interface SavePath {
  save(): Promise<SaveOutcome>
  flush(): Promise<SaveOutcome>
  close(): Promise<SaveOutcome>
  handOver(): Promise<HandOver>
}

/** Whether the handle is closed, and the close or the hand-over that runs. */
interface EndState {
  closed: boolean
  ending: Promise<SaveOutcome> | undefined
}

/** Starts the end of a handle, as a close or as a hand-over, and gives that attempt. */
type StartEnding = () => Promise<SaveOutcome>

function closeWith(state: EndState, startEnding: StartEnding): Promise<SaveOutcome> {
  if (state.ending !== undefined) {
    return state.ending
  }
  if (state.closed) {
    return Promise.resolve(SAVED)
  }
  return startEnding()
}

/**
 * Ends the handle as a close does and gives its lock to the caller. A call that overlaps a close or
 * another hand-over shares that attempt and gets no lock, so the lock has one owner at a time.
 */
async function handOverWith(
  state: EndState,
  startEnding: StartEnding,
  hold: ProjectLockHold,
): Promise<HandOver> {
  if (state.ending !== undefined) {
    const shared = await state.ending
    return shared.ok ? CLOSED_OUTCOME : shared
  }
  if (state.closed) {
    return CLOSED_OUTCOME
  }
  const outcome = await startEnding()
  return outcome.ok ? { ok: true, hold } : outcome
}

/** What a handle does with its lock at the end of a close and at the end of a hand-over. */
interface LockEnds {
  readonly releaseLock: () => Promise<void>
  readonly keepLock: () => Promise<void>
}

function lockEnds(hold: ProjectLockHold, records: RecordKeeper): LockEnds {
  // The keeper hears of it first: once another handle can take the lock, no record is built here.
  // A hand-over keeps the lock for the restored handle, which shares the keeper: it says nothing.
  return {
    releaseLock: () => {
      records.lockReleased()
      return callGuardedAsync(() => hold.release())
    },
    keepLock: () => Promise.resolve(),
  }
}

/**
 * The save, the flush, the close, and the hand-over of a handle. A close flushes again while
 * autosave has work left: a write is needed, or a write of the handle runs or waits, whoever asked
 * for it, so no store save runs after the lock is freed. Then it marks the handle closed and stops
 * autosave with no wait in between, then waits for the record writes of the handle, at most
 * `RECORD_WAIT_MS`, then tells the keeper and frees the lock. A hand-over does the same, except
 * that it keeps the lock for its caller and does not tell the keeper. A flush that fails leaves the
 * handle open, the lock held, and autosave armed. A close called while another close runs, also
 * while that close frees the lock, gets the same attempt, so the lock is freed once.
 */
function createSavePath(parts: SavePathParts): SavePath {
  const { autosave, hold, records } = parts
  const state: EndState = { closed: false, ending: undefined }

  const save = (): Promise<SaveOutcome> =>
    state.closed ? Promise.resolve(CLOSED_OUTCOME) : autosave.save().then(() => SAVED, failedWith)
  const flush = (): Promise<SaveOutcome> =>
    state.closed ? Promise.resolve(CLOSED_OUTCOME) : autosave.flush().then(() => SAVED, failedWith)

  const endOnce = async (afterEnd: () => Promise<void>): Promise<SaveOutcome> => {
    let outcome = await flush()
    while (outcome.ok && autosave.hasWorkLeft()) {
      outcome = await flush()
    }
    if (!outcome.ok) {
      return outcome
    }
    state.closed = true
    autosave.dispose()
    await records.settled()
    await afterEnd()
    return SAVED
  }

  const startEnding = (afterEnd: () => Promise<void>): Promise<SaveOutcome> => {
    state.ending = endOnce(afterEnd).finally(() => {
      state.ending = undefined
    })
    return state.ending
  }
  const { releaseLock, keepLock } = lockEnds(hold, records)

  return {
    save,
    flush,
    close: () => closeWith(state, () => startEnding(releaseLock)),
    handOver: () => handOverWith(state, () => startEnding(keepLock), hold),
  }
}

/**
 * Raises saved-with-faults for a store save that found faults, unless the document opened despite
 * format faults: such a document was faulty already, so no sound copy is kept for it.
 */
function reportFaultsTo(
  notices: HandleNotices,
  opened: OpenedProject,
): (report: SaveReport) => void {
  return (report) => {
    if (!opened.openedDespiteFaults && report.faults.length > 0) {
      notices.raise('saved-with-faults')
    }
  }
}

/** What the autosave of a handle tells: each status, and what each store save found. */
interface WriteListeners {
  onStatusChange(next: SaveStatus): void
  onReport(report: SaveReport): void
}

/** What the listeners of the writes of a handle report to. */
interface WriteListenerParts {
  readonly session: EditorSession
  readonly status: SaveStatusCell
  readonly reportFaults: (report: SaveReport) => void
  readonly records: RecordKeeper
  readonly storedFlag: StoredFlag
}

/**
 * Sets each status, and once a write reported saved, asks for the record of the session's project:
 * no change arrived since that write started, so it is the stored project. The session is marked,
 * so the keeper makes no record once a later change arrives. A store save always reports before
 * its write reports saved, so the last report is that of the write.
 */
function listenToWrites(parts: WriteListenerParts): WriteListeners {
  const { session, status, reportFaults, records, storedFlag } = parts
  let lastReport: SaveReport | undefined
  return {
    onReport(report) {
      lastReport = report
      reportFaults(report)
    },
    onStatusChange(next) {
      // The mark is taken before the status listeners run, so an edit that one of them makes
      // keeps the record from being made.
      const stored = next === 'saved' ? markSession(session) : undefined
      storedFlag.noteStatus(next)
      status.set(next)
      if (stored !== undefined && lastReport !== undefined) {
        records.saved(stored, lastReport)
      }
    },
  }
}

/**
 * Builds the handle of an opened project: its session, its autosave, its status, its notices, and
 * its save, flush, and close. It records the store and the hand-over of the handle in the internal
 * lookup of the session layer, so that the handle keeps only its public members.
 */
export function createDocumentHandle(parts: DocumentHandleParts): DocumentHandle {
  const { request, store, hold, opened, records } = parts
  const session = parts.session ?? createEditorSession(opened.project)
  const status = createSaveStatusCell()
  const notices = createHandleNotices()
  if (opened.savedByNewerBuild) {
    notices.raise('saved-by-newer-build')
  }
  const snapshots = parts.snapshots ?? store.snapshots(request.id)
  const reportFaults = reportFaultsTo(notices, opened)
  const storedFlag = createStoredFlag(parts.stored ?? false)
  const autosave = createAutosave({
    session,
    store,
    projectId: request.id,
    ...(parts.leaveSnapshots === true ? {} : { snapshots }),
    ...listenToWrites({ session, status, reportFaults, records, storedFlag }),
  })
  const { save, flush, close, handOver } = createSavePath({ autosave, hold, records })
  const handle: DocumentHandle = {
    id: request.id,
    location: request.location,
    durable: store.durable,
    session,
    snapshots,
    saveStatus: status.get,
    subscribe: status.subscribe,
    onNotice: notices.onNotice,
    save,
    flush,
    close,
  }
  registerHandle(handle, { request, store, records, handOver, stored: storedFlag.get })
  return handle
}
