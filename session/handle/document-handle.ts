import type { DocumentStore, ProjectLockHold, SaveReport } from '../../storage'
import { type Autosave, createAutosave } from '../autosave/create-autosave'
import { createEditorSession } from '../editor-session/editor-session'
import { callGuarded, callGuardedAsync } from '../guarded-call'
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
}

interface SaveStatusCell {
  get(): SaveStatus
  set(status: SaveStatus): void
  subscribe(listener: () => void): () => void
}

const SAVED: SaveOutcome = { ok: true }

/** The message of a save or a flush asked of a handle that has closed. */
const HANDLE_CLOSED: SaveOutcome = {
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
  readonly status: SaveStatusCell
  readonly hold: ProjectLockHold
}

interface SavePath {
  save(): Promise<SaveOutcome>
  flush(): Promise<SaveOutcome>
  close(): Promise<SaveOutcome>
}

/**
 * The save, the flush, and the close of a handle. A close flushes until no change that arrived
 * during its write is unsaved, then marks the handle closed and stops autosave with no wait in
 * between, then frees the lock. A flush that fails leaves the handle open, the lock held, and
 * autosave armed. Closes that overlap share one attempt, so the lock is freed once.
 */
function createSavePath(parts: SavePathParts): SavePath {
  const { autosave, status, hold } = parts
  let closed = false
  let closing: Promise<SaveOutcome> | undefined

  const save = (): Promise<SaveOutcome> =>
    closed ? Promise.resolve(HANDLE_CLOSED) : autosave.save().then(() => SAVED, failedWith)
  const flush = (): Promise<SaveOutcome> =>
    closed ? Promise.resolve(HANDLE_CLOSED) : autosave.flush().then(() => SAVED, failedWith)

  const closeOnce = async (): Promise<SaveOutcome> => {
    let outcome = await flush()
    while (outcome.ok && status.get() === 'pending') {
      outcome = await flush()
    }
    if (!outcome.ok) {
      return outcome
    }
    closed = true
    autosave.dispose()
    await callGuardedAsync(() => hold.release())
    return SAVED
  }

  const close = (): Promise<SaveOutcome> => {
    if (closed) {
      return Promise.resolve(SAVED)
    }
    closing ??= closeOnce().finally(() => {
      closing = undefined
    })
    return closing
  }

  return { save, flush, close }
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
 * its save, flush, and close.
 */
export function createDocumentHandle(parts: DocumentHandleParts): DocumentHandle {
  const { request, store, hold, opened } = parts
  const session = createEditorSession(opened.project)
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
  const savePath = createSavePath({ autosave, status, hold })
  return {
    id: request.id,
    location: request.location,
    durable: store.durable,
    session,
    snapshots: store.snapshots(request.id),
    saveStatus: status.get,
    subscribe: status.subscribe,
    onNotice: notices.onNotice,
    save: savePath.save,
    flush: savePath.flush,
    close: savePath.close,
  }
}
