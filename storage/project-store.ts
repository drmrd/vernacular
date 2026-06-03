import type { Project } from '../core'

export interface ProjectSummary {
  id: string
  name: string
}

/** Thrown by ProjectStore.load when no project exists under the given id. */
export class ProjectNotFoundError extends Error {
  constructor(public readonly projectId: string) {
    super(`No project stored under id "${projectId}"`)
    this.name = 'ProjectNotFoundError'
  }
}

export interface ProjectStore {
  list(): Promise<ProjectSummary[]>
  load(id: string): Promise<Project>
  save(id: string, project: Project): Promise<void>
  delete(id: string): Promise<void>
}
