import type { ProjectRecord } from '../../storage'
import type { DocumentHandle, OpenFailed, OpenRequest } from '../handle/handle-types'
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
 * The request of the project of the id: its folder when its record names one, else the workspace.
 * The promise never rejects.
 */
export async function requestFor(ports: SessionPorts, id: string): Promise<OpenRequest> {
  const record = await recordOf(ports, id)
  if (record?.location.kind === 'folder') {
    return { id, location: record.location }
  }
  return { id, location: { kind: 'workspace' } }
}

/** The request to open, or why the folder cannot be used. */
type RecentTarget = { readonly ok: true; readonly request: OpenRequest } | OpenFailed

/**
 * Where the project of the id is kept: its request, or why the folder cannot be used. For a folder,
 * when the browser would ask the user, the access is requested here, inside the user's gesture. A
 * refusal or a missing folder ends the open before anything is stored. Rejects when that request
 * rejects.
 */
async function recentTarget(ports: SessionPorts, id: string): Promise<RecentTarget> {
  const request = await requestFor(ports, id)
  if (request.location.kind === 'folder' && (await wouldAskUser(ports, id))) {
    const answer = await ports.folders.reopen(id)
    if (answer === 'denied') {
      return { ok: false, failure: { kind: 'folder-permission' } }
    }
    if (answer === 'missing') {
      return { ok: false, failure: { kind: 'folder-unavailable' } }
    }
  }
  return { ok: true, request }
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
  let target: RecentTarget
  try {
    target = await recentTarget(ports, id)
  } catch (error) {
    return storageUnavailable(error)
  }
  return target.ok ? switchProject(ports, current, target.request) : target
}
