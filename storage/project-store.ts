import type { Project } from '../core'
import type { DocumentStore, ProjectSummary } from './documents/document-store'

export type { ProjectSummary }

/** Thrown by ProjectStore.load when no project exists under the given id. */
export class ProjectNotFoundError extends Error {
  constructor(public readonly projectId: string) {
    super(`No project stored under id "${projectId}"`)
    this.name = 'ProjectNotFoundError'
  }
}

/**
 * What the IndexedDB store offers for now. It has its own interface because it does not sit on the
 * byte port yet, so it is not a document store: it stores the document as an object, writes no
 * backup, and has no recovery snapshots. A later change moves it onto a directory port and this
 * interface goes away.
 */
export interface IndexedDbStore {
  list(): Promise<ProjectSummary[]>
  load(id: string): Promise<Project>
  save(id: string, project: Project): Promise<void>
  delete(id: string): Promise<void>
}

/**
 * What the application means by a project store: the document store with the codec in front, or
 * for now the IndexedDB store, which cannot be one. It is a union because the IndexedDB store is
 * not on the byte port yet; when that store moves, this type becomes the document store alone.
 */
export type ProjectStore = DocumentStore | IndexedDbStore
