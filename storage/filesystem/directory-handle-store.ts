const DB_NAME = 'vernacular-handles'
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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
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
export class DirectoryHandleStore {
  async put(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openDatabase()
    const record: StoredHandle = { id, handle }
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record))
  }

  async get(id: string): Promise<FileSystemDirectoryHandle | undefined> {
    const db = await openDatabase()
    const record = await promisify(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id) as IDBRequest<
        StoredHandle | undefined
      >,
    )
    return record?.handle
  }

  async remove(id: string): Promise<void> {
    const db = await openDatabase()
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id))
  }
}
