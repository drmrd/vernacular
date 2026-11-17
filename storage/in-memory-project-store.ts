import { WorkspaceDocumentStore } from './documents/document-store'
import { InMemoryDirectory } from './fs/in-memory-directory'
import { WorkspaceFiles } from './project-files/workspace-files'

/**
 * Many projects held in memory, for tests and the fallback when no durable backend resolves. It is
 * the document store over workspace files on an in-memory directory, and it is not durable.
 */
export class InMemoryProjectStore extends WorkspaceDocumentStore {
  constructor() {
    super(new WorkspaceFiles(new InMemoryDirectory(), { durable: false }))
  }
}
