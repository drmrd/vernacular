import type { DocumentHandle, OpenRequest } from '../handle/handle-types'
import { storageUnavailable } from '../handle/thrown-failures'
import type { SessionPorts } from '../ports'
import { type SwitchResult, switchProject } from './switch-project'

type FolderPermission = Awaited<ReturnType<SessionPorts['folders']['permission']>>

/** The folder access of the id. An answer that rejects counts as no remembered folder. */
async function folderPermissionOf(ports: SessionPorts, id: string): Promise<FolderPermission> {
  try {
    return await ports.folders.permission(id)
  } catch {
    return 'missing'
  }
}

/**
 * Where the project of the id is kept: the workspace when no folder is remembered for it, and the
 * folder otherwise. When the browser would ask the user, the access is requested here, inside the
 * user's gesture; its answer is left to the open. Rejects when that request rejects.
 */
async function recentTarget(ports: SessionPorts, id: string): Promise<OpenRequest> {
  const permission = await folderPermissionOf(ports, id)
  if (permission === 'missing') {
    return { id, location: { kind: 'workspace' } }
  }
  if (permission === 'prompt') {
    await ports.folders.reopen(id)
  }
  return { id, location: { kind: 'folder', folderName: '' } }
}

/**
 * Opens a project of the recent list by its id, from its folder when one is remembered for it and
 * from the workspace otherwise. The id of the current project returns the current handle and calls
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
