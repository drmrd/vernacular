import { repairOfferFor, type Project, type RepairOffer } from '../../core'
import { copyImportedAssets, neededAssetHashes, newProjectId } from '../../storage'
import type { DocumentStore } from '../../storage'
import { findDocumentStore } from '../handle/find-document-store'
import type { DocumentHandle } from '../handle/handle-types'
import { storageUnavailable } from '../handle/thrown-failures'
import type { SessionPorts } from '../ports'
import type { FlowResult, SwitchFailure } from './flow-result'
import { poolOf } from './import-file'
import { recentTarget, requestFor } from './open-recent'
import { freeLock, lockFor } from './project-lock-for'
import { repairedCopyOf } from './repaired-copy'
import { switchProject } from './switch-project'

export { repairedCopyName } from './repaired-copy'

export interface RepairedCopyRequest {
  /** The project that did not open. */
  readonly id: string
  /** The offer that the user saw. */
  readonly offer: RepairOffer
}

export type RepairedCopyResult =
  | {
      readonly ok: true
      readonly handle: DocumentHandle
      readonly missingAssets: readonly string[]
    }
  | { readonly ok: false; readonly failure: SwitchFailure }

export interface ReplaceRequest {
  readonly id: string
  /** The pointers that the offer the user saw removes. */
  readonly removedPaths: readonly string[]
}

/** The stored file is not the one that the offer was made for. Nothing was written. */
export type ReplaceRefusal = { readonly kind: 'repair-changed' }

const REPAIR_CHANGED: ReplaceRefusal = { kind: 'repair-changed' }

/**
 * The needed assets that the pool of the project that did not open holds. A workspace project
 * shares the workspace pool, so it supplies none. An asset that cannot be read is left out.
 */
async function assetsOfFolder(
  ports: SessionPorts,
  id: string,
  needed: readonly string[],
): Promise<ReadonlyMap<string, Uint8Array>> {
  const supplied = new Map<string, Uint8Array>()
  const request = await requestFor(ports, id)
  if (request.location.kind === 'workspace') {
    return supplied
  }
  const found = await findDocumentStore(ports, request)
  if (!found.ok) {
    return supplied
  }
  for (const hash of needed) {
    try {
      const bytes = await found.store.assets(id).get(hash)
      if (bytes !== undefined) {
        supplied.set(hash, bytes)
      }
    } catch (error) {
      console.warn('An asset of the folder project could not be read.', hash, error)
    }
  }
  return supplied
}

/** Copies into the pool of the copy each asset that it needs and gives the ones still missing. */
async function copyNeededAssets(
  ports: SessionPorts,
  request: RepairedCopyRequest,
  copy: { readonly id: string; readonly project: Project },
): Promise<readonly string[]> {
  const needed = neededAssetHashes(copy.project)
  const supplied = await assetsOfFolder(ports, request.id, needed)
  const pool = poolOf(ports, copy.id)
  return pool === undefined ? needed : copyImportedAssets(pool, supplied, needed)
}

/**
 * Opens the document of the offer as a new workspace project, named as a repaired copy. The switch
 * flushes the current project first; then the assets that the copy needs go into the pool, and the
 * copy is saved at once. No file of the project that did not open changes. Never rejects.
 */
export async function openRepairedAsNew(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  request: RepairedCopyRequest,
): Promise<RepairedCopyResult> {
  const project = repairedCopyOf(request.offer)
  const id = newProjectId([])
  const switched = await switchProject(ports, current, {
    id,
    location: { kind: 'workspace' },
    create: () => project,
  })
  if (!switched.ok) {
    return switched
  }
  const missingAssets = await copyNeededAssets(ports, request, { id, project })
  await switched.handle.save()
  return { ok: true, handle: switched.handle, missingAssets }
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index])
}

/**
 * Reads the stored file again and replaces it with its repair when that repair removes the same
 * pointers that the user saw. Gives why nothing was written, or undefined when the project may
 * open: after the replace, or because the stored file now decodes.
 */
async function replaceIfUnchanged(
  store: DocumentStore,
  request: ReplaceRequest,
): Promise<SwitchFailure | ReplaceRefusal | undefined> {
  const read = await store.read(request.id)
  if (read.ok) {
    return undefined
  }
  if (read.failure.kind === 'not-found') {
    return { kind: 'not-found' }
  }
  const { decode } = read.failure
  if (decode.kind !== 'format-rules') {
    return { kind: 'did-not-open', decode }
  }
  const offer = repairOfferFor(decode)
  if (offer === undefined || !samePaths(offer.removedPaths, request.removedPaths)) {
    return REPAIR_CHANGED
  }
  const report = await store.replaceStored(request.id, offer.document)
  return report.replaced ? undefined : REPAIR_CHANGED
}

/** The handle that stays open after the lock was taken, or why the replace stopped. */
type LockedReplace =
  | { readonly ok: true; readonly current: DocumentHandle | undefined }
  | { readonly ok: false; readonly failure: SwitchFailure | ReplaceRefusal }

/** Runs the replace under the project's lock, which is freed in every outcome. */
async function replaceUnderLock(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  { store, request }: { readonly store: DocumentStore; readonly request: ReplaceRequest },
): Promise<LockedReplace> {
  const locked = await lockFor(ports, current, request.id)
  if (!locked.ok) {
    return { ok: false, failure: locked.failure }
  }
  try {
    const refusal = await replaceIfUnchanged(store, request)
    if (refusal !== undefined) {
      return { ok: false, failure: refusal }
    }
    return { ok: true, current: locked.currentClosed ? undefined : current }
  } finally {
    await freeLock(locked.hold)
  }
}

/**
 * Replaces the stored document of the project with its repair and opens it. The target is found
 * as the recent list finds it; the stored file is read again under the project's lock, and the
 * store keeps its bytes as a backup before the write. A stored file that changed writes nothing.
 * Never rejects.
 */
export async function replaceWithRepaired(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  request: ReplaceRequest,
): Promise<FlowResult<ReplaceRefusal>> {
  try {
    const target = await recentTarget(ports, request.id)
    if (!target.ok) {
      return target
    }
    const found = await findDocumentStore(ports, target.request)
    if (!found.ok) {
      return found
    }
    const replaced = await replaceUnderLock(ports, current, { store: found.store, request })
    if (!replaced.ok) {
      return replaced
    }
    return await switchProject(ports, replaced.current, target.request)
  } catch (error) {
    return storageUnavailable(error)
  }
}
