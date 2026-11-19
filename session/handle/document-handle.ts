import type { DocumentStore, ProjectLockHold, ProjectSnapshots, SaveReport } from '../../storage'
import { type Autosave, createAutosave } from '../autosave/create-autosave'
import { createEditorSession, type EditorSession } from '../editor-session/editor-session'
import { callGuarded, callGuardedAsync } from '../guarded-call'
import { type HandOver, registerHandle } from './handle-internals'
import { createHandleNotices, type HandleNotices } from './handle-notices'
import type { DocumentHandle, OpenRequest, SaveOutcome, SaveStatus } from './handle-types'
import type { OpenedProject } from './read-for-open'
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

/**
 * The save, the flush, the close, and the hand-over of a handle. A close flushes again while
 * autosave has work left: a write is needed, or a write of the handle runs or waits, whoever asked
 * for it, so no store save runs after the lock is freed. Then it marks the handle closed and stops
 * autosave with no wait in between, then frees the lock. A hand-over does the same and keeps the
 * lock for its caller. A flush that fails leaves the handle open, the lock held, and autosave
 * armed. A close called while another close runs, also while that close frees the lock, gets the
 * same attempt, so the lock is freed once.
 */
function createSavePath(parts: SavePathParts): SavePath {
  const { autosave, hold } = parts
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
    await afterEnd()
    return SAVED
  }

  const startEnding = (afterEnd: () => Promise<void>): Promise<SaveOutcome> => {
    state.ending = endOnce(afterEnd).finally(() => {
      state.ending = undefined
    })
    return state.ending
  }
  const releaseLock = (): Promise<void> => callGuardedAsync(() => hold.release())
  const keepLock = (): Promise<void> => Promise.resolve()

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

/**
 * Builds the handle of an opened project: its session, its autosave, its status, its notices, and
 * its save, flush, and close. It records the store and the hand-over of the handle in the internal
 * lookup of the session layer, so that the handle keeps only its public members.
 */
export function createDocumentHandle(parts: DocumentHandleParts): DocumentHandle {
  const { request, store, hold, opened } = parts
  const session = parts.session ?? createEditorSession(opened.project)
  const status = createSaveStatusCell()
  const notices = createHandleNotices()
  if (opened.savedByNewerBuild) {
    notices.raise('saved-by-newer-build')
  }
  const autosave = createAutosave({
    session,
    store,
    projectId: request.id,
    onStatusChange: status.set,
    onReport: reportFaultsTo(notices, opened),
  })
  const savePath = createSavePath({ autosave, hold })
  const handle: DocumentHandle = {
    id: request.id,
    location: request.location,
    durable: store.durable,
    session,
    snapshots: parts.snapshots ?? store.snapshots(request.id),
    saveStatus: status.get,
    subscribe: status.subscribe,
    onNotice: notices.onNotice,
    save: savePath.save,
    flush: savePath.flush,
    close: savePath.close,
  }
  registerHandle(handle, { request, store, handOver: savePath.handOver })
  return handle
}
