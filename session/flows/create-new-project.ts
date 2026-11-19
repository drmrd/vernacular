import type { Project } from '../../core'
import { newProjectId } from '../../storage'
import type { DocumentHandle } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import { type SwitchResult, switchProject } from './switch-project'

/**
 * Starts a new project in the workspace under a new id. The current project is flushed and closed
 * by the switch, with no question asked. The open calls `create` for the first document and stores
 * nothing until the first save. The promise never rejects.
 */
export async function createNewProject(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  create: () => Project,
): Promise<SwitchResult> {
  const id = newProjectId([])
  return switchProject(ports, current, { id, location: { kind: 'workspace' }, create })
}
