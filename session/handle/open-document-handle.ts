import type { ProjectLockHold, ProjectSnapshots } from '../../storage'
import { callGuardedAsync } from '../guarded-call'
import type { SessionPorts } from '../ports'
import { createDocumentHandle, type DocumentHandleParts } from './document-handle'
import { recordFailedOpen } from './failed-open-record'
import { findDocumentStore } from './find-document-store'
import { createRecordKeeper } from './handle-record'
import type {
  DocumentHandle,
  OpenFailed,
  OpenOptions,
  OpenRequest,
  OpenResult,
} from './handle-types'
import { readForOpen } from './read-for-open'
import { setAsideRefusedCopies } from './set-aside-refused-copies'
import { markSession } from './session-mark'
import { storageUnavailable } from './thrown-failures'

type TakenLock = { readonly ok: true; readonly hold: ProjectLockHold } | OpenFailed

/** Takes the project's lock without waiting. It never rejects. */
async function takeLock(ports: SessionPorts, id: string): Promise<TakenLock> {
  try {
    const hold = await ports.locks.tryAcquire(id)
    if (hold === undefined) {
      return { ok: false, failure: { kind: 'open-elsewhere' } }
    }
    return { ok: true, hold }
  } catch (error) {
    return storageUnavailable(error)
  }
}

/** What an open holds before it has read the project: the handle parts without the read result. */
type OpenParts = Omit<DocumentHandleParts, 'opened' | 'snapshots'>

/**
 * What the open says about the recovery copies of the project. A copy that cannot be read moves to
 * the backups first, so that no prune of the autosave can remove it. When that fails, the handle
 * leaves the snapshots alone. With `leaveSnapshots` nothing moves.
 */
async function recoveryCopyParts(
  parts: OpenParts,
  snapshots: ProjectSnapshots,
): Promise<Pick<DocumentHandleParts, 'leaveSnapshots' | 'recoveryCopyKept'>> {
  if (parts.leaveSnapshots === true) {
    return { leaveSnapshots: true }
  }
  const outcome = await setAsideRefusedCopies(snapshots)
  return { leaveSnapshots: outcome === 'failed', recoveryCopyKept: outcome === 'kept' }
}

/**
 * Reads the project and builds its handle, under a lock already taken. A project that the read
 * found in the store gets its record, written apart from the open. It never rejects.
 */
async function openUnderLock(parts: OpenParts): Promise<OpenResult> {
  const read = await readForOpen(parts.store, parts.request)
  if (!read.ok) {
    return read
  }
  let handle: DocumentHandle
  try {
    const snapshots = parts.store.snapshots(parts.request.id)
    const recoveryCopies = await recoveryCopyParts(parts, snapshots)
    handle = createDocumentHandle({
      ...parts,
      ...recoveryCopies,
      snapshots,
      opened: read.opened,
      stored: read.stored,
    })
  } catch (error) {
    return storageUnavailable(error)
  }
  if (read.stored) {
    parts.records.opened(markSession(handle.session), read.lastChangedAt, read.opened.secondFile)
  }
  return { ok: true, handle }
}

/**
 * Opens a project: finds its store, takes its lock, reads it, and builds its session and
 * autosave. Each failure is typed, a failure frees the lock it took, and the promise never
 * rejects. A stored project that did not open has that noted in its record, if it has one, before
 * the lock is freed; the open waits for that note at most `RECORD_WAIT_MS`. With `leaveSnapshots`
 * the handle saves without a recovery snapshot and without a prune.
 */
export async function openDocumentHandle(
  ports: SessionPorts,
  request: OpenRequest,
  options: OpenOptions = {},
): Promise<OpenResult> {
  const found = await findDocumentStore(ports, request)
  if (!found.ok) {
    return found
  }
  const lock = await takeLock(ports, request.id)
  if (!lock.ok) {
    return lock
  }
  const records = createRecordKeeper(ports, request)
  const result = await openUnderLock({
    request,
    store: found.store,
    hold: lock.hold,
    records,
    ...options,
  })
  if (!result.ok) {
    if (result.failure.kind === 'did-not-open') {
      await recordFailedOpen(ports, request.id, result.failure.decode)
    }
    // A release that fails goes to the console; the open still reports its own failure.
    await callGuardedAsync(() => lock.hold.release())
  }
  return result
}
