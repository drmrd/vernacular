import { afterEach, describe, expect, it } from 'vitest'
import { assertDirectoryPortContract } from '../fs/directory-contract'
import { IndexedDbDirectory } from './indexeddb-directory'

const createdDatabases: string[] = []

/** A database name no other test uses; it is deleted again after the test. */
function freshDatabaseName(): string {
  const name = `vernacular-directory-test-${crypto.randomUUID()}`
  createdDatabases.push(name)
  return name
}

/**
 * Settles when the browser has deleted the database, or has queued the deletion
 * behind a connection that the directory still holds open.
 */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onblocked = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

const rawConnections: IDBDatabase[] = []

/** Opens the database with the raw API and keeps it open, with no versionchange handler. */
function openRawConnection(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onsuccess = () => {
      rawConnections.push(request.result)
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })
}

afterEach(async () => {
  rawConnections.splice(0).forEach((connection) => connection.close())
  await Promise.all(createdDatabases.splice(0).map(deleteDatabase))
})

const BYTE_VALUE_COUNT = 256
const ONE_MEGABYTE = 1024 * 1024
const LARGE_VALUE_PATTERN_MODULUS = 251

assertDirectoryPortContract('IndexedDbDirectory', () => new IndexedDbDirectory(freshDatabaseName()))

describe('IndexedDbDirectory in a real browser', () => {
  describeDurability()
  describeIsolation()
  describeModificationTime()
  describeValueSizes()
  describeUnavailableDatabase()
  describeCallsDuringABlockedUpgrade()
})

function describeDurability(): void {
  it('reads bytes through a new instance over the same database name', async () => {
    const name = freshDatabaseName()
    await new IndexedDbDirectory(name).writeFile('a/doc.json', Uint8Array.of(1, 2, 3))

    const read = await new IndexedDbDirectory(name).readFile('a/doc.json')

    expect(read).toEqual(Uint8Array.of(1, 2, 3))
  })
}

function describeIsolation(): void {
  it('keeps the files of two different database names apart', async () => {
    const first = new IndexedDbDirectory(freshDatabaseName())
    const second = new IndexedDbDirectory(freshDatabaseName())

    await first.writeFile('doc.json', Uint8Array.of(1))

    expect(await second.readFile('doc.json')).toBeUndefined()
    expect(await second.list('')).toEqual([])
  })
}

function describeModificationTime(): void {
  it('reports a modification time that Date.parse reads as an ISO instant', async () => {
    const directory = new IndexedDbDirectory(freshDatabaseName())
    await directory.writeFile('doc.json', Uint8Array.of(1))

    const modified = await directory.modifiedAt('doc.json')

    expect(Number.isNaN(Date.parse(modified ?? ''))).toBe(false)
    expect(new Date(Date.parse(modified ?? '')).toISOString()).toBe(modified)
  })
}

function describeValueSizes(): void {
  it('round-trips a value of one megabyte byte-equal', async () => {
    const directory = new IndexedDbDirectory(freshDatabaseName())
    const large = Uint8Array.from(
      { length: ONE_MEGABYTE },
      (_, i) => i % LARGE_VALUE_PATTERN_MODULUS,
    )

    await directory.writeFile('large.bin', large)

    expect(await directory.readFile('large.bin')).toEqual(large)
  })

  it('round-trips binary bytes with every value from 0 to 255', async () => {
    const directory = new IndexedDbDirectory(freshDatabaseName())
    const everyValue = Uint8Array.from({ length: BYTE_VALUE_COUNT }, (_, i) => i)

    await directory.writeFile('all-bytes.bin', everyValue)

    expect(await directory.readFile('all-bytes.bin')).toEqual(everyValue)
  })
}

const OLDER_BUILD_VERSION = 1
const NEWER_BUILD_VERSION = 3
const HANG_TIMEOUT_MILLISECONDS = 3000

function describeUnavailableDatabase(): void {
  it(
    'rejects with a message about another tab when an older build holds the database open',
    { timeout: HANG_TIMEOUT_MILLISECONDS },
    async () => {
      const name = freshDatabaseName()
      await openRawConnection(name, OLDER_BUILD_VERSION)

      const attempt = new IndexedDbDirectory(name).readFile('x')

      await expect(attempt).rejects.toThrow(/another tab/i)
    },
  )

  it(
    'works on the same instance after the blocking connection closes',
    { timeout: HANG_TIMEOUT_MILLISECONDS },
    async () => {
      const name = freshDatabaseName()
      const blocking = await openRawConnection(name, OLDER_BUILD_VERSION)
      const directory = new IndexedDbDirectory(name)
      await expect(directory.readFile('x')).rejects.toBeInstanceOf(Error)

      blocking.close()

      await directory.writeFile('x', Uint8Array.of(7))
      expect(await directory.readFile('x')).toEqual(Uint8Array.of(7))
    },
  )

  it('rejects when the database is newer than this build understands', async () => {
    const name = freshDatabaseName()
    const newer = await openRawConnection(name, NEWER_BUILD_VERSION)
    newer.close()

    await expect(new IndexedDbDirectory(name).readFile('x')).rejects.toBeInstanceOf(Error)
  })
}

/** Every call on a directory whose upgrade is blocked rejects in time, not only the first. */
function describeCallsDuringABlockedUpgrade(): void {
  it(
    'rejects every call with a message about another tab while an older build holds the database open',
    { timeout: HANG_TIMEOUT_MILLISECONDS },
    async () => {
      const name = freshDatabaseName()
      await openRawConnection(name, OLDER_BUILD_VERSION)
      const directory = new IndexedDbDirectory(name)

      await expect(directory.readFile('x')).rejects.toThrow(/another tab/i)
      await expect(directory.readFile('x')).rejects.toThrow(/another tab/i)
      await expect(directory.list('')).rejects.toThrow(/another tab/i)
    },
  )

  it(
    'works on the same instance after two rejected calls and the closing of the blocking connection',
    { timeout: HANG_TIMEOUT_MILLISECONDS },
    async () => {
      const name = freshDatabaseName()
      const blocking = await openRawConnection(name, OLDER_BUILD_VERSION)
      const directory = new IndexedDbDirectory(name)
      await expect(directory.readFile('x')).rejects.toThrow(/another tab/i)
      await expect(directory.readFile('x')).rejects.toThrow(/another tab/i)

      blocking.close()

      await directory.writeFile('x', Uint8Array.of(7))
      expect(await directory.readFile('x')).toEqual(Uint8Array.of(7))
    },
  )

  it(
    'writes nothing when a write is rejected during the block',
    { timeout: HANG_TIMEOUT_MILLISECONDS },
    async () => {
      const name = freshDatabaseName()
      const blocking = await openRawConnection(name, OLDER_BUILD_VERSION)
      const directory = new IndexedDbDirectory(name)
      await expect(directory.writeFile('x', Uint8Array.of(7))).rejects.toThrow(/another tab/i)

      blocking.close()

      expect(await directory.readFile('x')).toBeUndefined()
    },
  )
}
