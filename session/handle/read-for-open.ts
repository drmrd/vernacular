import { repairOfferFor, type DecodeFailure, type Project } from '../../core'
import { InvalidProjectIdError, type DocumentStore, type SecondFileState } from '../../storage'
import type { OpenRequest, ReadFailed } from './handle-types'
import { storageUnavailable } from './thrown-failures'

/** The project that an open starts from, and what the read found out about it. */
export interface OpenedProject {
  readonly project: Project
  readonly savedByNewerBuild: boolean
  readonly secondFile?: SecondFileState
}

/** True when the read chose the second file as the newer copy of the project. */
export function openedFromSecondFile(opened: OpenedProject): boolean {
  return opened.secondFile?.read === 'second'
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
  | ReadFailed

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

/** A document that failed to decode does not open. It carries a repair when one would fix it. */
function refusedDecode(decode: DecodeFailure): ReadForOpen {
  const repair = repairOfferFor(decode)
  return {
    ok: false,
    failure: { kind: 'did-not-open', decode, ...(repair === undefined ? {} : { repair }) },
  }
}

async function readStored(store: DocumentStore, request: OpenRequest): Promise<ReadForOpen> {
  const read = await store.read(request.id)
  if (read.ok) {
    const { project, savedByNewerBuild } = read.value
    const { secondFile } = read
    const flags = { savedByNewerBuild, ...(secondFile === undefined ? {} : { secondFile }) }
    return foundStored(openedProject(project, flags), read.lastChangedAt)
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
