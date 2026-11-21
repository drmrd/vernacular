import type { ProjectRecord } from '../../storage'
import type { DocumentHandle, OpenRequest } from '../handle/handle-types'
import { storageUnavailable } from '../handle/thrown-failures'
import type { SessionPorts } from '../ports'
import { type SwitchResult, switchProject } from './switch-project'

/** The record of the id in the index. A `get` that rejects counts as no record. */
async function recordOf(ports: SessionPorts, id: string): Promise<ProjectRecord | undefined> {
  try {
    return await ports.index.get(id)
  } catch {
    return undefined
  }
}

/**
 * Whether the browser would ask the user for the folder of the id. An answer that rejects is left
 * to the open, which reports that the storage did not answer.
 */
async function wouldAskUser(ports: SessionPorts, id: string): Promise<boolean> {
  try {
    return (await ports.folders.permission(id)) === 'prompt'
  } catch {
    return false
  }
}

/**
 * Where the project of the id is kept: the folder that its record names, and the workspace when it
 * has no record or a workspace record. For a folder, when the browser would ask the user, the access
 * is requested here, inside the user's gesture; its answer is left to the open. Rejects when that
 * request rejects.
 */
async function recentTarget(ports: SessionPorts, id: string): Promise<OpenRequest> {
  const record = await recordOf(ports, id)
  if (record?.location.kind !== 'folder') {
    return { id, location: { kind: 'workspace' } }
  }
  if (await wouldAskUser(ports, id)) {
    await ports.folders.reopen(id)
  }
  return { id, location: record.location }
}

/**
 * Opens a project of the recent list by its id, from the folder that its record names, and from
 * the workspace otherwise. The id of the current project returns the current handle and calls
 * nothing. The promise never rejects.
 */
export async function openRecent(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  id: string,
): Promise<SwitchResult> {
  if (current?.id === id) {
    return { ok: true, handle: current }
  }
  let target: OpenRequest
  try {
    target = await recentTarget(ports, id)
  } catch (error) {
    return storageUnavailable(error)
  }
  return switchProject(ports, current, target)
}
