import type { ProjectLockHold } from '../../storage'
import { callGuardedAsync } from '../guarded-call'
import { internalsOf } from '../handle/handle-internals'
import type { DocumentHandle } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import { storageFailureOf } from './card-flow-failures'

export type LockFailure =
  | { readonly kind: 'open-elsewhere' | 'flush-failed' }
  | { readonly kind: 'storage-unavailable'; readonly message: string }

/** The lock of the project, taken for a removal, or why it was not taken. */
export type LockResult =
  | { readonly ok: true; readonly hold: ProjectLockHold; readonly currentClosed: boolean }
  | { readonly ok: false; readonly failure: LockFailure; readonly currentClosed: boolean }

function failed(failure: LockFailure, currentClosed = false): LockResult {
  return { ok: false, failure, currentClosed }
}

/**
 * Ends the open project's handle, keeps its lock, tells its record keeper that the lock moved, and
 * waits for the record write that runs. A handle that cannot end stays open, with one exception:
 * when a close of the same handle overlaps, the hand-over gives flush-failed with currentClosed
 * false although the handle is closed.
 */
async function lockOfOpenProject(current: DocumentHandle): Promise<LockResult> {
  const internals = internalsOf(current)
  const handedOver = await internals.handOver()
  if (!handedOver.ok) {
    return failed({ kind: 'flush-failed' })
  }
  internals.records.lockReleased()
  await internals.records.settled()
  return { ok: true, hold: handedOver.hold, currentClosed: true }
}

async function lockOfOtherProject(ports: SessionPorts, id: string): Promise<LockResult> {
  const hold = await ports.locks.tryAcquire(id)
  return hold === undefined
    ? failed({ kind: 'open-elsewhere' })
    : { ok: true, hold, currentClosed: false }
}

/**
 * Takes the lock of the project of the id before a removal. Another project that is open in this
 * tab is flushed first. The open project of the id ends through its hand-over, which saves its
 * pending changes and gives its lock to the caller. The promise never rejects.
 */
export async function lockFor(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  id: string,
): Promise<LockResult> {
  try {
    if (current?.id === id) {
      return await lockOfOpenProject(current)
    }
    if (current !== undefined && !(await current.flush()).ok) {
      return failed({ kind: 'flush-failed' })
    }
    return await lockOfOtherProject(ports, id)
  } catch (error) {
    return failed(storageFailureOf(error))
  }
}

/** Frees the lock. Never rejects. */
export function freeLock(hold: ProjectLockHold): Promise<void> {
  return callGuardedAsync(() => hold.release())
}
