import type { DirectoryPort } from '../fs/directory-port'

const DATABASE_VERSION = 2
const FILES_STORE = 'files'
/** Sorts after every character that can appear in a path, so it ends a prefix range. */
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
    this.connection ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(FILES_STORE)) {
          request.result.createObjectStore(FILES_STORE, { keyPath: 'path' })
        }
      }
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close()
          this.connection = undefined
        }
        resolve(request.result)
      }
      request.onerror = () => {
        this.connection = undefined
        reject(request.error ?? new Error('Failed to open IndexedDB'))
      }
    })
    return this.connection
  }
}
