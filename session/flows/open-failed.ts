import { repairOfferFor, type RepairOffer } from '../../core'
import type { DocumentStore, PackSupplies } from '../../storage'
import { findDocumentStore } from '../handle/find-document-store'
import type { DocumentHandle } from '../handle/handle-types'
import { storageUnavailable } from '../handle/thrown-failures'
import type { SessionPorts } from '../ports'
import type { FlowResult, SwitchFailure } from './flow-result'
import { assetsOfFolder, openAsNewProject, type NewProjectResult } from './new-project-copy'
import { recentTarget } from './open-recent'
import { freeLock, lockFor } from './project-lock-for'
import { repairedCopyOf } from './repaired-copy'
import { switchProject } from './switch-project'

export { repairedCopyName } from './repaired-copy'

export interface RepairedCopyRequest {
  /** The project that did not open. */
  readonly id: string
  /** The offer that the user saw. */
  readonly offer: RepairOffer
  /**
   * The assets that installed packs supply. A `pack:` reference that a pack supplies is not a
   * missing asset.
   */
  readonly packSupplies?: PackSupplies
}

export type RepairedCopyResult = NewProjectResult

export interface ReplaceRequest {
  readonly id: string
  /** The pointers that the offer the user saw removes. */
  readonly removedPaths: readonly string[]
}

/** The stored file is not the one that the offer was made for. Nothing was written. */
export type ReplaceRefusal = { readonly kind: 'repair-changed' }

/** Why a replace stopped before the project opens, or that it may open. */
type ReplaceOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: SwitchFailure | ReplaceRefusal }

const MAY_OPEN: ReplaceOutcome = { ok: true }

const REPAIR_CHANGED: ReplaceOutcome = { ok: false, failure: { kind: 'repair-changed' } }

/**
 * Opens the document of the offer as a new workspace project, named as a repaired copy. The switch
 * flushes the current project first; then the assets that the copy needs go into the pool, and the
 * copy is saved at once. The result holds the handle whatever that save's outcome; a failed save
 * shows in the save status. No file of the project that did not open changes. Never rejects.
 */
export function openRepairedAsNew(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  request: RepairedCopyRequest,
): Promise<RepairedCopyResult> {
  return openAsNewProject(ports, current, {
    project: repairedCopyOf(request.offer),
    packSupplies: request.packSupplies,
    supplied: (needed) => assetsOfFolder(ports, request.id, needed),
  })
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index])
}

/**
 * Reads the stored file again and replaces it with its repair when that repair removes the same
 * pointers that the user saw. Gives why nothing was written, or that the project may open: after
 * the replace, or because the stored file now decodes.
 */
async function replaceIfUnchanged(
  store: DocumentStore,
  request: ReplaceRequest,
): Promise<ReplaceOutcome> {
  const read = await store.read(request.id)
  if (read.ok) {
    return MAY_OPEN
  }
  if (read.failure.kind === 'not-found') {
    return { ok: false, failure: { kind: 'not-found' } }
  }
  const { decode } = read.failure
  if (decode.kind !== 'format-rules') {
    return { ok: false, failure: { kind: 'did-not-open', decode } }
  }
  const offer = repairOfferFor(decode)
  if (offer === undefined || !samePaths(offer.removedPaths, request.removedPaths)) {
    return REPAIR_CHANGED
  }
  const report = await store.replaceStored(request.id, offer.document)
  if (!report.replaced) {
    console.error(
      'The repair breaks the format rules; the stored file is not replaced.',
      report.faults,
    )
    return REPAIR_CHANGED
  }
  return MAY_OPEN
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
    const replaced = await replaceIfUnchanged(store, request)
    if (!replaced.ok) {
      return replaced
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
