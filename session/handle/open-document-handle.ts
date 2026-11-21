import type { ProjectLockHold } from '../../storage'
import { callGuardedAsync } from '../guarded-call'
import type { SessionPorts } from '../ports'
import { createDocumentHandle, type DocumentHandleParts } from './document-handle'
import { recordFailedOpen } from './failed-open-record'
import { findDocumentStore } from './find-document-store'
import { createRecordKeeper } from './handle-record'
import type { DocumentHandle, OpenFailed, OpenRequest, OpenResult } from './handle-types'
import { readForOpen } from './read-for-open'
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

/**
 * Reads the project and builds its handle, under a lock already taken. A project that the read
 * found in the store gets its record, written apart from the open. It never rejects.
 */
async function openUnderLock(parts: Omit<DocumentHandleParts, 'opened'>): Promise<OpenResult> {
  const read = await readForOpen(parts.store, parts.request)
  if (!read.ok) {
    return read
  }
  let handle: DocumentHandle
  try {
    handle = createDocumentHandle({ ...parts, opened: read.opened })
  } catch (error) {
    return storageUnavailable(error)
  }
  if (read.stored) {
    parts.records.opened(markSession(handle.session), read.opened, read.lastChangedAt)
  }
  return { ok: true, handle }
}

/**
 * Opens a project: finds its store, takes its lock, reads it, and builds its session and
 * autosave. Each failure is typed, a failure frees the lock it took, and the promise never
 * rejects. A stored project that did not open has that noted in its record, if it has one, before
 * the lock is freed; the open waits for that note at most `RECORD_WAIT_MS`.
 */
export async function openDocumentHandle(
  ports: SessionPorts,
  request: OpenRequest,
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
  const result = await openUnderLock({ request, store: found.store, hold: lock.hold, records })
  if (!result.ok) {
    if (result.failure.kind === 'did-not-open') {
      await recordFailedOpen(ports, request.id, result.failure.decode)
    }
    // A release that fails goes to the console; the open still reports its own failure.
    await callGuardedAsync(() => lock.hold.release())
  }
  return result
}
