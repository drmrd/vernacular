import { WorkspaceDocumentStore } from '../documents/document-store'
import type { DirectoryPort } from '../fs/directory-port'
import { FileSystemDirectory } from '../fs/file-system-directory'
import { WorkspaceFiles } from '../project-files/workspace-files'
import { originPrivateRoot } from './origin-private-root'

/**
 * Many projects under one directory, each in a subdirectory named by its id. It is the document
 * store over durable workspace files, so the codec, the backups, and the snapshots come from the
 * wrapper and not from this class.
 */
export class OpfsProjectStore extends WorkspaceDocumentStore {
  constructor(root: DirectoryPort) {
    super(new WorkspaceFiles(root, { durable: true }))
  }
}

/** Build the durable OPFS-backed project store from the origin private file system. */
export async function createOpfsProjectStore(): Promise<OpfsProjectStore> {
  const root = await originPrivateRoot()
  return new OpfsProjectStore(new FileSystemDirectory(root))
}
