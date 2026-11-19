import type { DecodeFailure, Project } from '../../core'
import { InvalidProjectIdError, type DocumentStore } from '../../storage'
import type { OpenFailed, OpenRequest } from './handle-types'
import { storageUnavailable } from './thrown-failures'

/** The project that an open starts from, and what the read found out about it. */
export interface OpenedProject {
  readonly project: Project
  readonly savedByNewerBuild: boolean
  /** True when the interim rule opened a document that fails the check. */
  readonly openedDespiteFaults: boolean
}

/** The project to open, or why it did not open. */
export type ReadForOpen = { readonly ok: true; readonly opened: OpenedProject } | OpenFailed

function openedOn(
  project: Project,
  flags: Partial<Omit<OpenedProject, 'project'>> = {},
): ReadForOpen {
  const opened = { project, savedByNewerBuild: false, openedDespiteFaults: false, ...flags }
  return { ok: true, opened }
}

/** A document that failed to decode opens only under the interim rule for format faults. */
async function openFailedDecode(
  store: DocumentStore,
  id: string,
  decode: DecodeFailure,
): Promise<ReadForOpen> {
  if (decode.kind !== 'format-rules') {
    return { ok: false, failure: { kind: 'did-not-open', decode } }
  }
  const project = await store.openDespiteFormatFaults(id, decode)
  return openedOn(project, { openedDespiteFaults: true })
}

async function readStored(store: DocumentStore, request: OpenRequest): Promise<ReadForOpen> {
  const read = await store.read(request.id)
  if (read.ok) {
    return openedOn(read.value.project, { savedByNewerBuild: read.value.savedByNewerBuild })
  }
  if (read.failure.kind === 'not-found') {
    return request.create === undefined
      ? { ok: false, failure: { kind: 'not-found' } }
      : openedOn(request.create())
  }
  return openFailedDecode(store, request.id, read.failure.decode)
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
