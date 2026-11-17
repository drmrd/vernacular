/** The object store that holds one record per file. */
export const FILES_STORE = 'files'

/** One file of the directory as it is stored. */
export interface FileRecord {
  path: string
  bytes: Uint8Array
  modifiedAt: string
  /** Set only by the conversion of a legacy record: the token of that one conversion. A save never writes it. */
  convertedBy?: string
}

/** Resolves with the result of a request, or rejects with its error. */
export function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

/** The stored file at the path, or undefined when there is none. */
export function readFileRecord(
  database: IDBDatabase,
  path: string,
): Promise<FileRecord | undefined> {
  const store = database.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE)
  return settle<FileRecord | undefined>(store.get(path))
}

/** Resolves when the transaction commits, and rejects when it fails or aborts. */
export function finish(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })
}
