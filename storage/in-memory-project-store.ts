import { WorkspaceDocumentStore } from './documents/document-store'
import type { DirectoryPort } from './fs/directory-port'
import { InMemoryDirectory } from './fs/in-memory-directory'
import { WorkspaceFiles } from './project-files/workspace-files'

/**
 * Many projects held in memory, for tests and the fallback when no durable backend resolves. It is
 * the document store over workspace files on a directory, and it is not durable. With no argument
 * the directory is a private in-memory one; a caller can give the directory, so that two instances
 * share the same bytes (tests use this).
 */
export class InMemoryProjectStore extends WorkspaceDocumentStore {
  constructor(root: DirectoryPort = new InMemoryDirectory()) {
    super(new WorkspaceFiles(root, { durable: false }))
  }
}
