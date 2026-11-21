import type { DocumentHandle } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import { removableAssets, usersOf } from './asset-users'
import { readRecord, storageUnavailable } from './card-flow-failures'
import { freeLock, lockFor } from './project-lock-for'

export interface DeleteRequest {
  readonly id: string
  /** Every content hash that the user's library holds, or undefined when that is not known. */
  readonly libraryHashes: ReadonlySet<string> | undefined
}

export type DeleteFailure =
  | { readonly kind: 'open-elsewhere' | 'flush-failed' | 'folder-project' }
  | { readonly kind: 'storage-unavailable'; readonly message: string }

export type DeleteResult =
  | {
      readonly ok: true
      readonly currentClosed: boolean
      readonly removedAssets: readonly string[]
    }
  | { readonly ok: false; readonly failure: DeleteFailure; readonly currentClosed: boolean }

type Removal =
  | { readonly ok: true; readonly removedAssets: readonly string[] }
  | { readonly ok: false; readonly failure: DeleteFailure }

/** The document, then the record, then the assets that only this project used. */
async function removeProjectAndItsAssets(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  request: DeleteRequest,
): Promise<Removal> {
  try {
    const read = await usersOf(ports, current)
    if (!read.ok) {
      return read
    }
    const { id, libraryHashes } = request
    const removedAssets = removableAssets(id, read.users, libraryHashes)
    await ports.workspace.delete(id)
    await ports.index.remove(id)
    if (removedAssets.length > 0) {
      await ports.workspace.removeAssets(removedAssets)
    }
    return { ok: true, removedAssets }
  } catch (error) {
    return { ok: false, failure: storageUnavailable(error) }
  }
}

/**
 * Deletes the workspace project of the id: its document, backups, snapshots, and record, and the
 * pool assets that no other project and no library item uses. The open project's pending changes
 * are written first, and the handle of the open project ends before anything is removed. A folder
 * project is never deleted. The lock is held from before the first removal and freed in every
 * outcome. The promise never rejects.
 */
export async function deleteProject(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  request: DeleteRequest,
): Promise<DeleteResult> {
  const read = await readRecord(ports, request.id)
  if ('failure' in read) {
    return { ok: false, failure: read.failure, currentClosed: false }
  }
  if (read.record?.location.kind === 'folder') {
    return { ok: false, failure: { kind: 'folder-project' }, currentClosed: false }
  }
  const locked = await lockFor(ports, current, request.id)
  if (!locked.ok) {
    return locked
  }
  const { currentClosed } = locked
  try {
    const removal = await removeProjectAndItsAssets(ports, current, request)
    return { ...removal, currentClosed }
  } finally {
    await freeLock(locked.hold)
  }
}
