import type { DirectoryPort } from '../fs/directory-port'
import { FILES_STORE, finish, settle, type FileRecord } from './indexeddb-requests'
import {
  convertLegacyRecords,
  deleteLegacyRecord,
  hasLegacyFile,
  legacyProjectId,
  LEGACY_MODIFIED_AT,
  LEGACY_STORE,
  listLegacyPaths,
  readLegacyFile,
} from './legacy-records'

const DATABASE_VERSION = 2
const BLOCKED_MESSAGE =
  'Another tab holds the storage open with an older version of the app. Close that tab and try again.'
/** Sorts after every character that can appear in a path, so it ends a prefix range. */
const HIGHEST_CODE_UNIT = '\uffff'

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

function childNames(paths: string[], directoryPath: string): string[] {
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

/** Options of {@link IndexedDbDirectory}. */
export interface IndexedDbDirectoryOptions {
  /** Runs once after the database opens, before the first operation resolves. */
  convertLegacy?: (database: IDBDatabase) => Promise<void>
}

/**
 * DirectoryPort over one IndexedDB database. Each file is one record in the
 * `files` object store, keyed by its path, so the folder layout, the snapshot
 * store, and the asset cache serve this backend unchanged. The constructor opens
 * nothing; the database opens on first use, and then the records that earlier
 * versions kept as live objects become files. Until a record has a file, the
 * directory serves the record as the file `<id>/vernacular.json`. The connection
 * closes when another connection asks to delete or upgrade the database. When
 * the conversion fails, the connection closes and the next call opens and
 * converts again.
 */
export class IndexedDbDirectory implements DirectoryPort {
  private connection: Promise<IDBDatabase> | undefined
  private readonly convertLegacy: (database: IDBDatabase) => Promise<void>

  constructor(
    private readonly databaseName: string,
    options: IndexedDbDirectoryOptions = {},
  ) {
    this.convertLegacy = options.convertLegacy ?? ((database) => convertLegacyRecords(database))
  }

  async readFile(path: string): Promise<Uint8Array | undefined> {
    const database = await this.open()
    const store = database.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE)
    const record = await settle<FileRecord | undefined>(store.get(path))
    return record === undefined ? readLegacyFile(database, path) : new Uint8Array(record.bytes)
  }

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    const store = await this.store('readwrite')
    const record: FileRecord = { path, bytes: bytes.slice(), modifiedAt: new Date().toISOString() }
    store.put(record)
    await finish(store.transaction)
  }

  async removeFile(path: string): Promise<void> {
    const store = await this.removalStore()
    store.delete(path)
    const id = legacyProjectId(path)
    if (id !== undefined) {
      deleteLegacyRecord(store.transaction, id)
    }
    await finish(store.transaction)
  }

  async removeTree(prefix: string): Promise<void> {
    const store = await this.removalStore()
    store.delete(pathsUnder(`${prefix}/`))
    deleteLegacyRecord(store.transaction, prefix)
    await finish(store.transaction)
  }

  async modifiedAt(path: string): Promise<string | undefined> {
    const database = await this.open()
    const store = database.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE)
    const record = await settle<FileRecord | undefined>(store.get(path))
    if (record !== undefined) {
      return record.modifiedAt
    }
    return (await hasLegacyFile(database, path)) ? LEGACY_MODIFIED_AT : undefined
  }

  async list(prefix: string): Promise<string[]> {
    const directoryPath = prefix === '' ? '' : `${prefix}/`
    const database = await this.open()
    const store = database.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE)
    const paths = (await settle(store.getAllKeys(pathsUnder(directoryPath)))) as string[]
    const legacyPaths = await listLegacyPaths(database)
    return childNames(
      [...paths, ...legacyPaths.filter((path) => path.startsWith(directoryPath))],
      directoryPath,
    )
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const database = await this.open()
    return database.transaction(FILES_STORE, mode).objectStore(FILES_STORE)
  }

  /** The files store, in a transaction that also covers the legacy store when it exists. */
  private async removalStore(): Promise<IDBObjectStore> {
    const database = await this.open()
    const names = database.objectStoreNames.contains(LEGACY_STORE)
      ? [FILES_STORE, LEGACY_STORE]
      : [FILES_STORE]
    return database.transaction(names, 'readwrite').objectStore(FILES_STORE)
  }

  private open(): Promise<IDBDatabase> {
    this.connection ??= connect(this.databaseName, () => {
      this.connection = undefined
    }).then((database) => this.converted(database))
    return this.connection
  }

  private async converted(database: IDBDatabase): Promise<IDBDatabase> {
    try {
      await this.convertLegacy(database)
    } catch (error) {
      database.close()
      this.connection = undefined
      throw error
    }
    return database
  }
}
