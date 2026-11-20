import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteDatabaseNamed,
  freshDatabaseName,
  registerDatabaseCleanup,
} from '../indexeddb/legacy-records-test-kit'
import { IndexedDbProjectIndex } from './indexeddb-project-index'
import { describeProjectIndexContract } from './project-index-contract'
import { sampleRecord } from './project-record-test-kit'

registerDatabaseCleanup()

const DEFAULT_DATABASE_NAME = 'vernacular-index'
const RECORDS_STORE = 'records'
const FIRST_VERSION = 1
const HIGHER_VERSION = 2

function openRaw(
  name: string,
  version: number | undefined,
  onUpgrade?: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => onUpgrade?.(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function resultOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

/** Runs the work on a raw connection at the current version of the database, then closes it. */
async function withRawConnection<T>(
  name: string,
  work: (database: IDBDatabase) => Promise<T>,
): Promise<T> {
  const database = await openRaw(name, undefined)
  try {
    return await work(database)
  } finally {
    database.close()
  }
}

/** Puts a value into the records store through a raw connection, whatever form the value has. */
function putRawValue(name: string, value: unknown): Promise<void> {
  return withRawConnection(name, (database) => {
    const transaction = database.transaction(RECORDS_STORE, 'readwrite')
    transaction.objectStore(RECORDS_STORE).put(value)
    return completed(transaction)
  })
}

/** The keys that the records store holds, read through a raw connection. */
function rawKeysOf(name: string): Promise<IDBValidKey[]> {
  return withRawConnection(name, (database) =>
    resultOf(database.transaction(RECORDS_STORE).objectStore(RECORDS_STORE).getAllKeys()),
  )
}

/** Makes a database of the higher version, with a records store that holds one good record. */
async function seedHigherVersion(name: string): Promise<void> {
  const database = await openRaw(name, HIGHER_VERSION, (upgrading) => {
    upgrading.createObjectStore(RECORDS_STORE, { keyPath: 'id' })
  })
  try {
    const transaction = database.transaction(RECORDS_STORE, 'readwrite')
    transaction.objectStore(RECORDS_STORE).put(sampleRecord())
    await completed(transaction)
  } finally {
    database.close()
  }
}

/** Whether the promise rejected or resolved; it never throws. */
function settlementOf(promise: Promise<unknown>): Promise<'rejected' | 'resolved'> {
  return promise.then(
    () => 'resolved',
    () => 'rejected',
  )
}

/**
 * What deleting the database does: 'blocked' as soon as some connection is still open, 'deleted'
 * when none is. It settles at once either way, so a connection left open fails the test and never
 * hangs it.
 */
function deletionOutcome(name: string): Promise<'blocked' | 'deleted'> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onblocked = () => resolve('blocked')
    request.onsuccess = () => resolve('deleted')
    request.onerror = () => reject(request.error)
  })
}

function describeSharedStorage(): void {
  it('a record survives a new instance', async () => {
    const name = freshDatabaseName()
    await new IndexedDbProjectIndex(name).put(sampleRecord())

    expect(await new IndexedDbProjectIndex(name).get('house')).toEqual(sampleRecord())
  })

  it('two instances on one database see the writes of each other', async () => {
    const name = freshDatabaseName()
    const first = new IndexedDbProjectIndex(name)
    const second = new IndexedDbProjectIndex(name)

    await first.put(sampleRecord({ id: 'from-first' }))
    await second.put(sampleRecord({ id: 'from-second' }))

    const seenByFirst = (await first.all()).map((record) => record.id)
    const seenBySecond = (await second.all()).map((record) => record.id)
    expect(seenByFirst).toEqual(['from-first', 'from-second'])
    expect(seenBySecond).toEqual(['from-first', 'from-second'])
  })
}

function describeForeignValues(): void {
  it('a stored value that is not a record is left out of all() and of get, and a put replaces it', async () => {
    const name = freshDatabaseName()
    const index = new IndexedDbProjectIndex(name)
    await index.put(sampleRecord({ id: 'good' }))
    await putRawValue(name, { id: 'broken', name: 42, location: 'nowhere' })

    expect((await index.all()).map((record) => record.id)).toEqual(['good'])
    expect(await index.get('broken')).toBeUndefined()
    expect(await rawKeysOf(name)).toEqual(['broken', 'good'])

    await index.put(sampleRecord({ id: 'broken' }))

    expect(await index.get('broken')).toEqual(sampleRecord({ id: 'broken' }))
    expect((await index.all()).map((record) => record.id)).toEqual(['broken', 'good'])
  })
}

function describeDefaultDatabase(): void {
  afterEach(() => deleteDatabaseNamed(DEFAULT_DATABASE_NAME))

  it('the default database is vernacular-index, with a records store keyed by id', async () => {
    await deleteDatabaseNamed(DEFAULT_DATABASE_NAME)
    await new IndexedDbProjectIndex().put(sampleRecord())

    await withRawConnection(DEFAULT_DATABASE_NAME, (database) => {
      expect(database.version).toBe(FIRST_VERSION)
      expect([...database.objectStoreNames]).toEqual([RECORDS_STORE])
      const store = database.transaction(RECORDS_STORE).objectStore(RECORDS_STORE)
      expect(store.keyPath).toBe('id')
      return Promise.resolve()
    })
  })
}

function describeHigherVersion(): void {
  it('a database of a higher version makes every call reject and stays as it is', async () => {
    const name = freshDatabaseName()
    await seedHigherVersion(name)
    const index = new IndexedDbProjectIndex(name)

    expect(await settlementOf(index.all())).toBe('rejected')
    expect(await settlementOf(index.get('house'))).toBe('rejected')
    expect(await settlementOf(index.put(sampleRecord({ id: 'barn' })))).toBe('rejected')
    expect(await settlementOf(index.remove('house'))).toBe('rejected')

    await withRawConnection(name, (database) => {
      expect(database.version).toBe(HIGHER_VERSION)
      return Promise.resolve()
    })
    expect(await rawKeysOf(name)).toEqual(['house'])
  })
}

function describeOpenConnections(): void {
  it('the database can be deleted right after a call, because the call closed its connection', async () => {
    const name = freshDatabaseName()
    const index = new IndexedDbProjectIndex(name)

    await index.put(sampleRecord())
    await index.get('house')
    await index.all()
    await index.remove('house')

    expect(await deletionOutcome(name)).toBe('deleted')
  })
}

describeProjectIndexContract(
  'IndexedDbProjectIndex',
  () => new IndexedDbProjectIndex(freshDatabaseName()),
)

describe('IndexedDbProjectIndex over real IndexedDB', () => {
  describeSharedStorage()
  describeForeignValues()
  describeDefaultDatabase()
  describeHigherVersion()
  describeOpenConnections()
})
