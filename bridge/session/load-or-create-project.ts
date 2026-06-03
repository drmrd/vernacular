import { ProjectNotFoundError, type ProjectStore } from '../../storage'
import type { Project } from '../../core'

/**
 * Loads the saved project, falling back to a freshly created one only when the
 * store reports no project under the id. Any other failure (corrupt data, I/O
 * fault) propagates rather than silently discarding a recoverable project.
 */
export async function loadOrCreateProject(
  store: ProjectStore,
  projectId: string,
  createFallback: () => Project,
): Promise<Project> {
  try {
    return await store.load(projectId)
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return createFallback()
    }
    throw error
  }
}
