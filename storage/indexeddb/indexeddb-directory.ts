import type { DirectoryPort } from '../fs/directory-port'
import { FILES_STORE, finish, readFileRecord, settle, type FileRecord } from './indexeddb-requests'
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
import {
  PENDING_OPEN_WAIT_MILLISECONDS,
  startOpen,
  waitForOpen,
  type OpenAttempt,
  type OpenWaits,
} from './open-attempt'

const DATABASE_VERSION = 2
/** An open normally arrives in a few milliseconds; this is long enough for a slow start. */
const DEFAULT_OPEN_WAIT_MILLISECONDS = 3000
/** The call that starts an open request rejects as soon as the browser reports a block. */
const NO_WAIT_AFTER_BLOCK_MILLISECONDS = 0
/** What a call that finds the open request pending waits, with or without a report of a block. */
const LATER_WAITS: OpenWaits = {
  total: PENDING_OPEN_WAIT_MILLISECONDS,
  afterBlock: PENDING_OPEN_WAIT_MILLISECONDS,
}
/** Sorts after every character that can appear in a path, so it ends a prefix range. */
const HIGHEST_CODE_UNIT = '\uffff'

function pathsUnder(directoryPath: string): IDBKeyRange {
  return IDBKeyRange.bound(directoryPath, directoryPath + HIGHEST_CODE_UNIT)
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
  /**
   * How many milliseconds the call that starts an open waits for the database to
   * open, before it rejects with a message about another tab. Defaults to a few
   * seconds.
   */
  openWaitMilliseconds?: number
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
 *
 * While a tab of an older build holds the database open, the upgrade is blocked
 * and the browser keeps the open request pending. No call waits without end.
 * The call that starts the request rejects with a message about another tab at
 * once when the browser reports the block, and otherwise when the request has
 * not arrived after `openWaitMilliseconds`; the browser reports a block only to
 * the first request that waits for the other connection. Every later call waits
 * a short fixed time for the pending request and then rejects with the same
 * message. No second request starts while one is pending. When the other tab
 * lets go, the next call gets the connection of that request. A connection that
 * arrives while no call waits is closed.
 */
export class IndexedDbDirectory implements DirectoryPort {
  private connection: Promise<IDBDatabase> | undefined
  /** The open request that the browser has not finished; at most one exists. */
  private attempt: OpenAttempt | undefined
  private readonly convertLegacy: (database: IDBDatabase) => Promise<void>
  private readonly openWaitMilliseconds: number

  constructor(
    private readonly databaseName: string,
    options: IndexedDbDirectoryOptions = {},
  ) {
    this.convertLegacy = options.convertLegacy ?? ((database) => convertLegacyRecords(database))
    this.openWaitMilliseconds = options.openWaitMilliseconds ?? DEFAULT_OPEN_WAIT_MILLISECONDS
  }

  async readFile(path: string): Promise<Uint8Array | undefined> {
    const database = await this.open()
    const record = await readFileRecord(database, path)
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
    const record = await readFileRecord(database, path)
    if (record !== undefined) {
      return record.modifiedAt
    }
    return (await hasLegacyFile(database, path)) ? LEGACY_MODIFIED_AT : undefined
  }

  async list(prefix: string): Promise<string[]> {
    const directoryPath = prefix === '' ? '' : `${prefix}/`
    const database = await this.open()
    const store = database.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE)
    const keys = await settle(store.getAllKeys(pathsUnder(directoryPath)))
    const paths = keys.filter((key): key is string => typeof key === 'string')
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
    if (this.connection === undefined) {
      const connection = this.connect()
      this.connection = connection
      connection.catch(() => {
        if (this.connection === connection) {
          this.connection = undefined
        }
      })
    }
    return this.connection
  }

  private async connect(): Promise<IDBDatabase> {
    return this.converted(await this.arrive())
  }

  /**
   * The connection of the open request. The call that starts the request waits
   * for the open wait of the directory, and rejects at once when the browser
   * reports a block. A call that finds the request still pending waits a short
   * time for it. Each of them then rejects, so that no call waits without end,
   * with or without a report of a block.
   */
  private async arrive(): Promise<IDBDatabase> {
    const pending = this.attempt
    const attempt = pending ?? this.startAttempt()
    const database = await waitForOpen(
      attempt,
      pending === undefined ? this.firstWaits() : LATER_WAITS,
    )
    database.onversionchange = () => {
      database.close()
      this.connection = undefined
    }
    return database
  }

  private firstWaits(): OpenWaits {
    return { total: this.openWaitMilliseconds, afterBlock: NO_WAIT_AFTER_BLOCK_MILLISECONDS }
  }

  private startAttempt(): OpenAttempt {
    const attempt = startOpen(this.databaseName, DATABASE_VERSION)
    this.attempt = attempt
    attempt.result.then(
      (database) => {
        this.attempt = undefined
        if (this.connection === undefined) {
          database.close()
        }
      },
      () => {
        this.attempt = undefined
      },
    )
    return attempt
  }

  private async converted(database: IDBDatabase): Promise<IDBDatabase> {
    try {
      await this.convertLegacy(database)
    } catch (error) {
      database.close()
      throw error
    }
    return database
  }
}
