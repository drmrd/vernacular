import type { FolderHandles, RememberedFolder } from './folder-access-types'

const DEFAULT_DATABASE_NAME = 'vernacular-handles'
const STORE_NAME = 'handles'
const DB_VERSION = 1

interface StoredHandle {
  id: string
  handle: FileSystemDirectoryHandle
}

/**
 * Opens the database at its one version. No `blocked` handler is needed today: the version has
 * never risen, and an open at the version that the database already has is never blocked. A rise
 * of the version must add a handler that rejects.
 */
function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DB_VERSION)
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
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = run(transaction.objectStore(STORE_NAME))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB request failed'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    })
  } finally {
    database.close()
  }
}

/**
 * Persists user-granted FileSystemDirectoryHandles in IndexedDB so a folder project can be
 * reopened across sessions. Directory handles are structured cloneable, so they round-trip
 * through IndexedDB unchanged; reopening them still requires re-granting permission. Each
 * operation opens the database, works in one transaction, and closes the connection again. The
 * tests run it in a real browser, since jsdom implements neither IndexedDB nor the File System
 * Access API.
 */
export class DirectoryHandleStore implements FolderHandles {
  constructor(private readonly databaseName: string = DEFAULT_DATABASE_NAME) {}

  async put(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
    const record: StoredHandle = { id, handle }
    await withStore(this.databaseName, 'readwrite', (store) => store.put(record))
  }

  async get(id: string): Promise<FileSystemDirectoryHandle | undefined> {
    const record = await withStore(
      this.databaseName,
      'readonly',
      (store) => store.get(id) as IDBRequest<StoredHandle | undefined>,
    )
    return record?.handle
  }

  async remove(id: string): Promise<void> {
    await withStore(this.databaseName, 'readwrite', (store) => store.delete(id))
  }

  /** Every stored handle with its id, in no particular order. */
  async entries(): Promise<RememberedFolder[]> {
    const records = await withStore(
      this.databaseName,
      'readonly',
      (store) => store.getAll() as IDBRequest<StoredHandle[]>,
    )
    return records.map(({ id, handle }) => ({ id, handle }))
  }
}
