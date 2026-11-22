import type { DocumentStore, ProjectLockHold, ProjectSnapshots, SaveReport } from '../../storage'
import { type Autosave, type AutosaveStatus, createAutosave } from '../autosave/create-autosave'
import { createEditorSession, type EditorSession } from '../editor-session/editor-session'
import { callGuarded } from '../guarded-call'
import { registerHandle } from './handle-internals'
import { createHandleNotices, raiseOpenNotices, reportNoticesTo } from './handle-notices'
import type { RecordKeeper } from './handle-record'
import { createSavePath } from './handle-save-path'
import { createStoredFlag, type StoredFlag } from './handle-stored'
import type { DocumentHandle, OpenRequest, SaveStatus } from './handle-types'
import type { OpenedProject } from './read-for-open'
import { markSession } from './session-mark'

/** What an open found, from which a handle is built. */
export interface DocumentHandleParts {
  readonly request: OpenRequest
  readonly store: DocumentStore
  readonly hold: ProjectLockHold
  readonly opened: OpenedProject
  /** A session built ahead on the opened project; when absent, the handle builds its own. */
  readonly session?: EditorSession
  /**
   * The snapshots of the request's id on the store. After a restore, the closed old handle and the
   * new handle share one snapshots object, which is safe because that object holds no state of a
   * session.
   */
  readonly snapshots: ProjectSnapshots
  /** True: the autosave writes no recovery snapshot and removes none. `snapshots` is unchanged. */
  readonly leaveSnapshots?: boolean
  /** True: the open moved a recovery copy that cannot be read to the backups; the handle says so. */
  readonly recoveryCopyKept?: boolean
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
  set(reported: AutosaveStatus): void
  subscribe(listener: () => void): () => void
}

/**
 * The save status, which tells its listeners of each new value and of no repeated one. On a store
 * that does not outlive the tab, a write that the autosave reports as saved reads as tab-only.
 */
function createSaveStatusCell(durable: boolean): SaveStatusCell {
  let status: SaveStatus = 'idle'
  const listeners = new Set<() => void>()
  return {
    get: () => status,
    set(reported) {
      const next = reported === 'saved' && !durable ? 'tab-only' : reported
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

/** What the autosave of a handle tells: each status, and what each store save found. */
interface WriteListeners {
  onStatusChange(next: AutosaveStatus): void
  onReport(report: SaveReport): void
}

/** What the listeners of the writes of a handle report to. */
interface WriteListenerParts {
  readonly session: EditorSession
  readonly status: SaveStatusCell
  readonly reportNotices: (report: SaveReport) => void
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
  const { session, status, reportNotices, records, storedFlag } = parts
  let lastReport: SaveReport | undefined
  return {
    onReport(report) {
      lastReport = report
      reportNotices(report)
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

/** The autosave of a handle, which leaves the recovery snapshots alone when the parts say so. */
function createHandleAutosave(
  parts: DocumentHandleParts,
  session: EditorSession,
  writes: WriteListeners,
): Autosave {
  const autosave = createAutosave({
    session,
    store: parts.store,
    projectId: parts.request.id,
    snapshots: parts.snapshots,
    ...writes,
  })
  if (parts.leaveSnapshots === true) {
    autosave.leaveSnapshots()
  }
  return autosave
}

/**
 * Builds the handle of an opened project: its session, its autosave, its status, its notices, and
 * its save, flush, and close. It records the store and the hand-over of the handle in the internal
 * lookup of the session layer, so that the handle keeps only its public members.
 */
export function createDocumentHandle(parts: DocumentHandleParts): DocumentHandle {
  const { request, store, hold, opened, records } = parts
  const session = parts.session ?? createEditorSession(opened.project)
  const status = createSaveStatusCell(store.durable)
  const notices = createHandleNotices()
  raiseOpenNotices(notices, opened)
  if (parts.recoveryCopyKept === true) {
    notices.raise('recovery-copy-kept')
  }
  const { snapshots } = parts
  const reportNotices = reportNoticesTo(notices)
  const storedFlag = createStoredFlag(parts.stored ?? false)
  const writes = listenToWrites({ session, status, reportNotices, records, storedFlag })
  const autosave = createHandleAutosave(parts, session, writes)
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
  registerHandle(handle, {
    request,
    store,
    records,
    handOver,
    leaveSnapshots: autosave.leaveSnapshots,
    stored: storedFlag.get,
  })
  return handle
}
