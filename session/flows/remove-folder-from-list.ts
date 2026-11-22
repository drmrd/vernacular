import type { DocumentHandle } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import { readRecord, storageFailureOf } from './card-flow-failures'
import { freeLock, lockFor } from './project-lock-for'

export type RemoveFromListFailure =
  | { readonly kind: 'open-elsewhere' | 'flush-failed' | 'workspace-project' }
  | { readonly kind: 'storage-unavailable'; readonly message: string }

export type RemoveFromListResult =
  | { readonly ok: true; readonly currentClosed: boolean }
  | {
      readonly ok: false
      readonly failure: RemoveFromListFailure
      readonly currentClosed: boolean
    }

/**
 * What the read of the record of the id found: a workspace record, or no reason to stop. An id
 * with no record is decided by the open project: a non-folder project that holds the id is a
 * workspace project.
 */
async function refusalFor(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  id: string,
): Promise<RemoveFromListFailure | undefined> {
  const read = await readRecord(ports, id)
  if ('failure' in read) {
    return read.failure
  }
  const location = read.record?.location ?? (current?.id === id ? current.location : undefined)
  return location !== undefined && location.kind !== 'folder'
    ? { kind: 'workspace-project' }
    : undefined
}

/**
 * Forgets the remembered folder of the project of the id, then removes its record. The folder
 * project that is open in this tab is saved into its folder and ended first; when that fails,
 * nothing is forgotten. No file of the folder is touched. The lock is held from before the forget
 * and freed in every outcome. The promise never rejects.
 */
export async function removeFolderFromList(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  id: string,
): Promise<RemoveFromListResult> {
  const refusal = await refusalFor(ports, current, id)
  if (refusal !== undefined) {
    return { ok: false, failure: refusal, currentClosed: false }
  }
  const locked = await lockFor(ports, current, id)
  if (!locked.ok) {
    return locked
  }
  const { currentClosed } = locked
  try {
    await ports.folders.forget(id)
    await ports.index.remove(id)
    return { ok: true, currentClosed }
  } catch (error) {
    return { ok: false, failure: storageFailureOf(error), currentClosed }
  } finally {
    await freeLock(locked.hold)
  }
}
