import { findRepairOffer, type DecodeFailure, type Project } from '../../core'
import { InvalidProjectIdError, type DocumentStore } from '../../storage'
import type { OpenFailed, OpenRequest } from './handle-types'
import { storageUnavailable } from './thrown-failures'

/** The project that an open starts from, and what the read found out about it. */
export interface OpenedProject {
  readonly project: Project
  readonly savedByNewerBuild: boolean
}

/** The project to open, or why it did not open. */
export type ReadForOpen =
  | {
      readonly ok: true
      readonly opened: OpenedProject
      /** False when the project comes from `create`. */
      readonly stored: boolean
      /** From the read; undefined for `create` and for a read that could not tell. */
      readonly lastChangedAt: string | undefined
    }
  | OpenFailed

function openedProject(
  project: Project,
  flags: Partial<Omit<OpenedProject, 'project'>> = {},
): OpenedProject {
  return { project, savedByNewerBuild: false, ...flags }
}

/** A project that the read found in the store. */
function foundStored(opened: OpenedProject, lastChangedAt: string | undefined): ReadForOpen {
  return { ok: true, opened, stored: true, lastChangedAt }
}

/** A document that failed to decode does not open; one that breaks the format rules may be repairable. */
function refusedDecode(decode: DecodeFailure): ReadForOpen {
  const repair = decode.kind === 'format-rules' ? findRepairOffer(decode.document) : undefined
  return {
    ok: false,
    failure: { kind: 'did-not-open', decode, ...(repair === undefined ? {} : { repair }) },
  }
}

async function readStored(store: DocumentStore, request: OpenRequest): Promise<ReadForOpen> {
  const read = await store.read(request.id)
  if (read.ok) {
    const { project, savedByNewerBuild } = read.value
    return foundStored(openedProject(project, { savedByNewerBuild }), read.lastChangedAt)
  }
  if (read.failure.kind === 'not-found') {
    return request.create === undefined
      ? { ok: false, failure: { kind: 'not-found' } }
      : {
          ok: true,
          opened: openedProject(request.create()),
          stored: false,
          lastChangedAt: undefined,
        }
  }
  return refusedDecode(read.failure.decode)
}

/**
 * Reads the project once, and starts from `create` when the store does not hold it. An id that
 * cannot name a project is not found. It never rejects.
 */
export async function readForOpen(
  store: DocumentStore,
  request: OpenRequest,
): Promise<ReadForOpen> {
  try {
    return await readStored(store, request)
  } catch (error) {
    if (error instanceof InvalidProjectIdError) {
      return { ok: false, failure: { kind: 'not-found' } }
    }
    return storageUnavailable(error)
  }
}
