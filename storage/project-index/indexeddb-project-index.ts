import { finish, settle } from '../indexeddb/indexeddb-requests'
import { isProjectRecord } from './project-record-check'
import type { ProjectIndex, ProjectRecord } from './project-index'

/** The name of the database that holds the project index. */
export const PROJECT_INDEX_DATABASE_NAME = 'vernacular-index'
const STORE_NAME = 'records'
const DATABASE_VERSION = 1

/**
 * Opens the database at its one version. No `blocked` handler is needed today: the version has
 * never risen, and an open at the version that the database already has is never blocked. A rise
 * of the version must add a handler that rejects. A database of a higher version rejects the open
 * and is left as it is.
 */
function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

/**
 * Opens the database, runs one request in one transaction, and closes the connection again, also
 * when the work fails. Resolves with the request's result once the transaction has completed.
 */
async function withStore<T>(
  databaseName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase(databaseName)
  try {
    const transaction = database.transaction(STORE_NAME, mode)
    const [result] = await Promise.all([
      settle(run(transaction.objectStore(STORE_NAME))),
      finish(transaction),
    ])
    return result
  } finally {
    database.close()
  }
}

/** The project index of this browser, in its own IndexedDB database. */
export class IndexedDbProjectIndex implements ProjectIndex {
  constructor(private readonly databaseName: string = PROJECT_INDEX_DATABASE_NAME) {}

  async all(): Promise<ProjectRecord[]> {
    const values = await withStore(this.databaseName, 'readonly', (store) => store.getAll())
    return values.filter(isProjectRecord)
  }

  async get(id: string): Promise<ProjectRecord | undefined> {
    const value: unknown = await withStore(this.databaseName, 'readonly', (store) => store.get(id))
    return isProjectRecord(value) ? value : undefined
  }

  async put(record: ProjectRecord): Promise<void> {
    await withStore(this.databaseName, 'readwrite', (store) => store.put(record))
  }

  async remove(id: string): Promise<void> {
    await withStore(this.databaseName, 'readwrite', (store) => store.delete(id))
  }
}
