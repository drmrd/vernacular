import { WorkspaceDocumentStore } from '../documents/document-store'
import { WorkspaceFiles } from '../project-files/workspace-files'
import { IndexedDbDirectory } from './indexeddb-directory'

/** The name of the IndexedDB database that holds the projects of the running app. */
export const DEFAULT_PROJECT_DATABASE_NAME = 'vernacular'

/**
 * Many projects in one IndexedDB database, each under a path named by its id. It is the document
 * store over durable workspace files, so the codec, the backups, and the snapshots come from the
 * wrapper, and the directory owns every access to IndexedDB, including the records of the
 * earlier layout.
 */
export class IndexedDbProjectStore extends WorkspaceDocumentStore {
  constructor(databaseName: string = DEFAULT_PROJECT_DATABASE_NAME) {
    super(new WorkspaceFiles(new IndexedDbDirectory(databaseName), { durable: true }))
  }
}

/** The default durable store for the running app. */
export function createDefaultProjectStore(): IndexedDbProjectStore {
  return new IndexedDbProjectStore()
}
