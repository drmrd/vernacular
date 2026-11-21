import type { Project } from '../../core'
import { newProjectId } from '../../storage'
import type { OpenRequest } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import { reconcileIndex } from '../projects/reconcile-index'
import { recentRecords } from '../projects/recent-records'

/** The request of a project address: its folder when its record names one, else the workspace. */
export async function requestFor(ports: SessionPorts, id: string): Promise<OpenRequest> {
  try {
    const record = await ports.index.get(id)
    if (record?.location.kind === 'folder') {
      return { id, location: record.location }
    }
  } catch {
    // A record that cannot be read leaves the project in the workspace.
  }
  return { id, location: { kind: 'workspace' } }
}

/**
 * The request that the bare address opens: the project used last, or a new project under a new
 * id when the index holds no record. The promise never rejects.
 */
export async function startProject(
  ports: SessionPorts,
  create: () => Project,
): Promise<OpenRequest> {
  const latest = recentRecords(await reconcileIndex(ports))[0]
  if (latest === undefined) {
    return { id: newProjectId([]), location: { kind: 'workspace' }, create }
  }
  if (latest.location.kind === 'folder') {
    return { id: latest.id, location: latest.location }
  }
  return { id: latest.id, location: { kind: 'workspace' }, create }
}
