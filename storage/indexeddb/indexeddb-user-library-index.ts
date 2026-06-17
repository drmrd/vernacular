import type { LibraryItem } from '../assets/asset-source'
import type { UserLibraryIndex } from '../assets/user-source'

const DB_NAME = 'vernacular-user-library'
const STORE_NAME = 'assets'
const DB_VERSION = 1

interface StoredLibraryItem {
  contentHash: string
  item: LibraryItem
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
      request.result.createObjectStore(STORE_NAME, { keyPath: 'contentHash' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

/**
 * Durable UserLibraryIndex backed by IndexedDB: the user's imported assets
 * survive a reload. Each content-addressed asset is one record keyed by its
 * content hash, so re-importing the same bytes overwrites rather than duplicates.
 * This is the single seam that touches IndexedDB for the library; it is validated
 * by the end-to-end specs rather than unit tests, since jsdom does not implement
 * IndexedDB (mirroring IndexedDbProjectStore).
 */
export class IndexedDbUserLibraryIndex implements UserLibraryIndex {
  async list(): Promise<LibraryItem[]> {
    const db = await openDatabase()
    const records = await promisify(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll() as IDBRequest<
        StoredLibraryItem[]
      >,
    )
    return records.map((record) => record.item)
  }

  async add(item: LibraryItem): Promise<void> {
    const db = await openDatabase()
    const record: StoredLibraryItem = { contentHash: item.reference.contentHash, item }
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record))
  }
}
