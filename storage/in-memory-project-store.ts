import type { Project } from '../core'
import type { ProjectStore, ProjectSummary } from './project-store'

/**
 * Map-backed ProjectStore for tests and the not-yet-wired app shell. Durable
 * implementations (filesystem, OPFS, zip) land with the storage-scaffolds work.
 */
export class InMemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, Project>()

  async list(): Promise<ProjectSummary[]> {
    return [...this.projects.entries()].map(([id, project]) => ({ id, name: project.meta.name }))
  }

  async load(id: string): Promise<Project> {
    const project = this.projects.get(id)
    if (project === undefined) {
      throw new Error(`No project stored under id "${id}"`)
    }
    return project
  }

  async save(id: string, project: Project): Promise<void> {
    this.projects.set(id, project)
  }

  async delete(id: string): Promise<void> {
    this.projects.delete(id)
  }
}
