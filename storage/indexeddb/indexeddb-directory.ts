import type { DirectoryPort } from '../fs/directory-port'

const DATABASE_VERSION = 2
const FILES_STORE = 'files'
/** Sorts after every character that can appear in a path, so it ends a prefix range. */
const BLOCKED_MESSAGE =
  'Another tab holds the storage open with an older version of the app. Close that tab and try again.'
const HIGHEST_CODE_UNIT = '￿'

interface FileRecord {
  path: string
  bytes: Uint8Array
  modifiedAt: string
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function finish(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })
}

function pathsUnder(directoryPath: string): IDBKeyRange {
  return IDBKeyRange.bound(directoryPath, directoryPath + HIGHEST_CODE_UNIT)
}

/**
 * Opens the database and calls `onRelease` when the connection is no longer
 * usable: the open failed or was blocked, or another connection asked this one
 * to close. A blocked open rejects at once. The browser still finishes it when
 * the blocking connection closes, and then this function closes the connection
 * that nobody asked for.
 */
function connect(databaseName: string, onRelease: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let abandoned = false
    const request = indexedDB.open(databaseName, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FILES_STORE)) {
        request.result.createObjectStore(FILES_STORE, { keyPath: 'path' })
      }
    }
    request.onblocked = () => {
      abandoned = true
      onRelease()
      reject(new Error(BLOCKED_MESSAGE))
    }
    request.onsuccess = () => {
      const database = request.result
      if (abandoned) {
        database.close()
        return
      }
      database.onversionchange = () => {
        database.close()
        onRelease()
      }
      resolve(database)
    }
    request.onerror = () => {
      onRelease()
      reject(request.error ?? new Error('Failed to open IndexedDB'))
    }
  })
}

/**
 * DirectoryPort over one IndexedDB database. Each file is one record in the
 * `files` object store, keyed by its path, so the folder layout, the snapshot
 * store, and the asset cache serve this backend unchanged. The constructor opens
 * nothing; the database opens on first use. The connection closes when another
 * connection asks to delete or upgrade the database.
 */
export class IndexedDbDirectory implements DirectoryPort {
  private connection: Promise<IDBDatabase> | undefined

  constructor(private readonly databaseName: string) {}

  async readFile(path: string): Promise<Uint8Array | undefined> {
    const store = await this.store('readonly')
    const record = await settle<FileRecord | undefined>(store.get(path))
    return record === undefined ? undefined : new Uint8Array(record.bytes)
  }

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    const store = await this.store('readwrite')
    const record: FileRecord = { path, bytes: bytes.slice(), modifiedAt: new Date().toISOString() }
    store.put(record)
    await finish(store.transaction)
  }

  async removeFile(path: string): Promise<void> {
    const store = await this.store('readwrite')
    store.delete(path)
    await finish(store.transaction)
  }

  async removeTree(prefix: string): Promise<void> {
    const store = await this.store('readwrite')
    store.delete(pathsUnder(`${prefix}/`))
    await finish(store.transaction)
  }

  async modifiedAt(path: string): Promise<string | undefined> {
    const store = await this.store('readonly')
    const record = await settle<FileRecord | undefined>(store.get(path))
    return record?.modifiedAt
  }

  async list(prefix: string): Promise<string[]> {
    const directoryPath = prefix === '' ? '' : `${prefix}/`
    const store = await this.store('readonly')
    const paths = (await settle(store.getAllKeys(pathsUnder(directoryPath)))) as string[]
    const children = new Set<string>()
    for (const path of paths) {
      const rest = path.slice(directoryPath.length)
      const slashIndex = rest.indexOf('/')
      const firstSegment = slashIndex === -1 ? rest : rest.slice(0, slashIndex)
      if (firstSegment !== '') {
        children.add(firstSegment)
      }
    }
    return [...children]
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const database = await this.open()
    return database.transaction(FILES_STORE, mode).objectStore(FILES_STORE)
  }

  private open(): Promise<IDBDatabase> {
    this.connection ??= connect(this.databaseName, () => {
      this.connection = undefined
    })
    return this.connection
  }
}
