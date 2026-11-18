import { WorkspaceDocumentStore } from '../documents/document-store'
import type { DirectoryPort } from '../fs/directory-port'
import { WorkspaceFiles } from '../project-files/workspace-files'
import { IndexedDbDirectory } from './indexeddb-directory'

/** The name of the IndexedDB database that holds the projects of the running app. */
export const DEFAULT_PROJECT_DATABASE_NAME = 'vernacular'

/**
 * Many projects in one IndexedDB database, each under a path named by its id. It is the document
 * store over durable workspace files, so the codec, the backups, and the snapshots come from the
 * wrapper, and the directory owns every access to IndexedDB, including the records of the
 * earlier layout.
 *
 * The argument is either the name of the database to open, or a directory that is already open,
 * so a caller can share one connection between the store and the asset cache. Durable here means
 * that the data outlives a reload; the browser can still evict it while the storage is not
 * persisted.
 */
export class IndexedDbProjectStore extends WorkspaceDocumentStore {
  constructor(database: string | DirectoryPort = DEFAULT_PROJECT_DATABASE_NAME) {
    const directory = typeof database === 'string' ? new IndexedDbDirectory(database) : database
    super(new WorkspaceFiles(directory, { durable: true }))
  }
}
