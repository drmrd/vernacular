import type { ProjectLockHold } from '../../storage'
import type { SessionPorts } from '../ports'
import { createDocumentHandle, type DocumentHandleParts } from './document-handle'
import { findDocumentStore } from './find-document-store'
import type { OpenFailed, OpenRequest, OpenResult } from './handle-types'
import { readForOpen } from './read-for-open'
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

/** Frees a lock that an open took and did not use. A release that fails goes to the console. */
async function releaseUnused(hold: ProjectLockHold): Promise<void> {
  try {
    await hold.release()
  } catch (error) {
    console.error(error)
  }
}

/** Reads the project and builds its handle, under a lock already taken. It never rejects. */
async function openUnderLock(parts: Omit<DocumentHandleParts, 'opened'>): Promise<OpenResult> {
  const read = await readForOpen(parts.store, parts.request)
  if (!read.ok) {
    return read
  }
  try {
    return { ok: true, handle: createDocumentHandle({ ...parts, opened: read.opened }) }
  } catch (error) {
    return storageUnavailable(error)
  }
}

/**
 * Opens a project: finds its store, takes its lock, reads it, and builds its session and
 * autosave. Each failure is typed, a failure frees the lock it took, and the promise never
 * rejects.
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
  const result = await openUnderLock({ request, store: found.store, hold: lock.hold })
  if (!result.ok) {
    await releaseUnused(lock.hold)
  }
  return result
}
