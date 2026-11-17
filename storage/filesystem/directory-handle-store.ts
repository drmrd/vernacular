import type { FolderHandles, RememberedFolder } from './folder-access'

const DEFAULT_DATABASE_NAME = 'vernacular-handles'
const STORE_NAME = 'handles'
const DB_VERSION = 1

interface StoredHandle {
  id: string
  handle: FileSystemDirectoryHandle
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

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
 * Persists user-granted FileSystemDirectoryHandles in IndexedDB so a folder
 * project can be reopened across sessions. Directory handles are structured
 * cloneable, so they round-trip through IndexedDB unchanged; reopening them
 * still requires re-granting permission. Validated manually rather than by
 * unit tests, since jsdom implements neither IndexedDB nor the File System
 * Access API.
 */
export class DirectoryHandleStore implements FolderHandles {
  constructor(private readonly databaseName: string = DEFAULT_DATABASE_NAME) {}

  async put(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openDatabase(this.databaseName)
    const record: StoredHandle = { id, handle }
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record))
  }

  async get(id: string): Promise<FileSystemDirectoryHandle | undefined> {
    const db = await openDatabase(this.databaseName)
    const record = await promisify(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id) as IDBRequest<
        StoredHandle | undefined
      >,
    )
    return record?.handle
  }

  async remove(id: string): Promise<void> {
    const db = await openDatabase(this.databaseName)
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id))
  }

  /** Every stored handle with its id, in no particular order. */
  async entries(): Promise<RememberedFolder[]> {
    const db = await openDatabase(this.databaseName)
    const records = await promisify(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll() as IDBRequest<
        StoredHandle[]
      >,
    )
    return records.map(({ id, handle }) => ({ id, handle }))
  }
}
