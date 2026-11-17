import type { DocumentStore, ProjectSummary } from './documents/document-store'

export type { ProjectSummary }

/** Thrown by ProjectStore.load when no project exists under the given id. */
export class ProjectNotFoundError extends Error {
  constructor(public readonly projectId: string) {
    super(`No project stored under id "${projectId}"`)
    this.name = 'ProjectNotFoundError'
  }
}

/** What the application means by a project store: the document store with the codec in front. */
export type ProjectStore = DocumentStore
