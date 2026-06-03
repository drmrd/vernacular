import type { ProjectStore } from '../../storage'
import type { Project } from '../../core'

/**
 * Loads the saved project, falling back to a freshly created one when the store
 * has nothing under the id. The store rejects an absent id, so a failed load is
 * treated as "no saved project yet" rather than a hard error.
 */
export async function loadOrCreateProject(
  store: ProjectStore,
  projectId: string,
  createFallback: () => Project,
): Promise<Project> {
  try {
    return await store.load(projectId)
  } catch {
    return createFallback()
  }
}
