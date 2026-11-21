import type { Project } from '../../core'
import { newProjectId } from '../../storage'
import type { OpenRequest } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import { reconcileIndex } from '../projects/reconcile-index'
import { recentRecords } from '../projects/recent-records'

const WORKSPACE: OpenRequest['location'] = { kind: 'workspace' }

/** The request of a new project under a new id, kept in the workspace. */
export function newProjectRequest(create: () => Project): OpenRequest {
  return { id: newProjectId([]), location: WORKSPACE, create }
}

/**
 * The request of the start: the project used last, or a new project under a new id when the
 * index holds no record. The promise never rejects.
 */
export async function startProject(
  ports: SessionPorts,
  create: () => Project,
): Promise<OpenRequest> {
  const latest = recentRecords(await reconcileIndex(ports))[0]
  if (latest === undefined) {
    return newProjectRequest(create)
  }
  if (latest.location.kind === 'folder') {
    return { id: latest.id, location: latest.location }
  }
  return { id: latest.id, location: WORKSPACE, create }
}
