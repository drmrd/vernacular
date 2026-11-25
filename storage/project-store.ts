import type { DocumentStore, ProjectSummary } from './documents/document-store'

export type { ProjectSummary }

/**
 * Thrown when a project that should hold a document has none under the given id: by the import of
 * an archive that holds no document for the id, and by any write that needs an existing project
 * (`replaceStored` and `replaceStoredDocument`).
 */
export class ProjectNotFoundError extends Error {
  constructor(public readonly projectId: string) {
    super(`No project stored under id "${projectId}"`)
    this.name = 'ProjectNotFoundError'
  }
}

/** What the application means by a project store: the document store with the codec in front. */
export type ProjectStore = DocumentStore
