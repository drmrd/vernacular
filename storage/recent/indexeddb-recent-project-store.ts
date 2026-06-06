import type { RecentProjectEntry, RecentProjectStore } from './recent-project-store'

const DB_NAME = 'vernacular-recent'
const STORE_NAME = 'recent'
const DB_VERSION = 1

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
 * Durable RecentProjectStore backed by IndexedDB. This is the single seam that
 * touches IndexedDB for recents; it is validated end-to-end rather than by unit
 * tests, since jsdom does not implement IndexedDB.
 */
export class IndexedDbRecentProjectStore implements RecentProjectStore {
  async list(): Promise<RecentProjectEntry[]> {
    const db = await openDatabase()
    const entries = await promisify(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll() as IDBRequest<
        RecentProjectEntry[]
      >,
    )
    return entries.sort((first, second) => second.lastOpened - first.lastOpened)
  }

  async record(entry: RecentProjectEntry): Promise<void> {
    const db = await openDatabase()
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry))
  }

  async remove(id: string): Promise<void> {
    const db = await openDatabase()
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id))
  }
}
