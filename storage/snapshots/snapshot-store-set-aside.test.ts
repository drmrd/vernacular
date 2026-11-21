// @vitest-environment node
// Pure storage logic; node aligns TextEncoder/Uint8Array realms with serialization.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, decodeDocument } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { PassThroughDirectory } from '../documents/document-store-test-kit'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { SnapshotStore } from './snapshot-store'

const AUTOSAVE_DIRECTORY = '.house-autosave'
const BACKUP_DIRECTORY = '.house-backups'
const SESSION_START_PATH = `${AUTOSAVE_DIRECTORY}/session-start.json`
const OLDER_VERSION = 15
const NEWER_VERSION = CURRENT_SCHEMA_VERSION + 1
const NOT_A_PROJECT_VERSION = 0

/** Test support: rejects each write under the backup directory and passes the rest through. */
class BackupRefusingDirectory extends PassThroughDirectory {
  override writeFile(path: string, bytes: Uint8Array): Promise<void> {
    if (path.startsWith(`${BACKUP_DIRECTORY}/`))
      return Promise.reject(new Error('the disk is full'))
    return super.writeFile(path, bytes)
  }
}

function notJson(): Uint8Array {
  return new TextEncoder().encode('{"this is": not json')
}

function breakingTheFormatRules(version: number): Uint8Array {
  return bytesOf(withUnknownWallField(fixtureDocument(version)))
}

function fromNewerBuild(): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).schemaVersion = NEWER_VERSION
  return bytesOf(document)
}

function readable(): Uint8Array {
  return versionFixtureBytes(CURRENT_SCHEMA_VERSION)
}

async function holding(files: Record<string, Uint8Array>): Promise<InMemoryDirectory> {
  const directory = new InMemoryDirectory()
  for (const [path, bytes] of Object.entries(files)) await directory.writeFile(path, bytes)
  return directory
}

function backupNameOf(version: number, bytes: Uint8Array): string {
  const digest = createHash('sha256').update(bytes).digest('hex')
  return `refused-snapshot-v${version}-${digest}.json`
}

function backupPathOf(version: number, bytes: Uint8Array): string {
  return `${BACKUP_DIRECTORY}/${backupNameOf(version, bytes)}`
}

async function snapshotNames(directory: InMemoryDirectory): Promise<string[]> {
  return (await directory.list(AUTOSAVE_DIRECTORY)).sort()
}

describe('SnapshotStore.setAsideRefused', () => {
  it('moves a rolling snapshot that is not JSON to the backups, byte for byte, and removes it from the snapshots', async () => {
    const bytes = notJson()
    const directory = await holding({ [`${AUTOSAVE_DIRECTORY}/snapshot-1.json`]: bytes })

    await new SnapshotStore(directory).setAsideRefused()

    expect(await directory.list(BACKUP_DIRECTORY)).toEqual([
      backupNameOf(NOT_A_PROJECT_VERSION, bytes),
    ])
    expect(await directory.readFile(backupPathOf(NOT_A_PROJECT_VERSION, bytes))).toEqual(bytes)
    expect(await snapshotNames(directory)).toEqual([])
  })

  it('moves a snapshot that breaks the format rules, and names the backup by the version it was migrated from', async () => {
    const bytes = breakingTheFormatRules(OLDER_VERSION)
    expect(decodeDocument(bytes)).toMatchObject({
      ok: false,
      failure: { kind: 'format-rules', migratedFrom: OLDER_VERSION },
    })
    const directory = await holding({ [`${AUTOSAVE_DIRECTORY}/snapshot-1.json`]: bytes })

    await new SnapshotStore(directory).setAsideRefused()

    expect(await directory.readFile(backupPathOf(OLDER_VERSION, bytes))).toEqual(bytes)
    expect(await snapshotNames(directory)).toEqual([])
  })

  it('moves a snapshot of a newer version, and names the backup by that version', async () => {
    const bytes = fromNewerBuild()
    const directory = await holding({ [`${AUTOSAVE_DIRECTORY}/snapshot-1.json`]: bytes })

    await new SnapshotStore(directory).setAsideRefused()

    expect(await directory.readFile(backupPathOf(NEWER_VERSION, bytes))).toEqual(bytes)
    expect(await snapshotNames(directory)).toEqual([])
  })

  it('leaves a snapshot that decodes, and the session-start snapshot, in place', async () => {
    const sessionStart = notJson()
    const directory = await holding({
      [SESSION_START_PATH]: sessionStart,
      [`${AUTOSAVE_DIRECTORY}/snapshot-1.json`]: readable(),
      [`${AUTOSAVE_DIRECTORY}/snapshot-2.json`]: notJson(),
    })

    await new SnapshotStore(directory).setAsideRefused()

    expect(await snapshotNames(directory)).toEqual(['session-start.json', 'snapshot-1.json'])
    expect(await directory.readFile(`${AUTOSAVE_DIRECTORY}/snapshot-1.json`)).toEqual(readable())
    expect(await directory.readFile(SESSION_START_PATH)).toEqual(sessionStart)
  })

  it('resolves with the count of the snapshots that it moved, and with 0 when there is none', async () => {
    const directory = await holding({
      [`${AUTOSAVE_DIRECTORY}/snapshot-1.json`]: notJson(),
      [`${AUTOSAVE_DIRECTORY}/snapshot-2.json`]: breakingTheFormatRules(OLDER_VERSION),
      [`${AUTOSAVE_DIRECTORY}/snapshot-3.json`]: readable(),
    })
    const none = new SnapshotStore(await holding({}))

    expect(await new SnapshotStore(directory).setAsideRefused()).toBe(2)
    expect(await none.setAsideRefused()).toBe(0)
  })

  it('after the move, the store is recoverable only when a snapshot that decodes is left', async () => {
    const onlyRefused = new SnapshotStore(
      await holding({ [`${AUTOSAVE_DIRECTORY}/snapshot-1.json`]: notJson() }),
    )
    const withReadable = new SnapshotStore(
      await holding({
        [`${AUTOSAVE_DIRECTORY}/snapshot-1.json`]: notJson(),
        [`${AUTOSAVE_DIRECTORY}/snapshot-2.json`]: readable(),
      }),
    )

    await onlyRefused.setAsideRefused()
    await withReadable.setAsideRefused()

    expect(await onlyRefused.isRecoverable()).toBe(false)
    expect(await withReadable.isRecoverable()).toBe(true)
  })

  it('rejects and leaves the snapshot in place when the backup cannot be written', async () => {
    const bytes = notJson()
    const inner = await holding({ [`${AUTOSAVE_DIRECTORY}/snapshot-1.json`]: bytes })
    const store = new SnapshotStore(new BackupRefusingDirectory(inner))

    await expect(store.setAsideRefused()).rejects.toThrow('the disk is full')

    expect(await inner.readFile(`${AUTOSAVE_DIRECTORY}/snapshot-1.json`)).toEqual(bytes)
    expect(await inner.list(BACKUP_DIRECTORY)).toEqual([])
  })

  it('a second call moves nothing and writes no second backup', async () => {
    const bytes = notJson()
    const directory = await holding({ [`${AUTOSAVE_DIRECTORY}/snapshot-1.json`]: bytes })
    const store = new SnapshotStore(directory)
    await store.setAsideRefused()
    const backupsAfterFirst = await directory.list(BACKUP_DIRECTORY)

    expect(await store.setAsideRefused()).toBe(0)

    expect(await directory.list(BACKUP_DIRECTORY)).toEqual(backupsAfterFirst)
    expect(backupsAfterFirst).toHaveLength(1)
  })

  it('a prune after the move leaves the backup in place', async () => {
    const bytes = notJson()
    const directory = await holding({
      [SESSION_START_PATH]: readable(),
      [`${AUTOSAVE_DIRECTORY}/snapshot-1.json`]: bytes,
    })
    const store = new SnapshotStore(directory)
    await store.setAsideRefused()

    await store.prune()

    expect(await directory.readFile(backupPathOf(NOT_A_PROJECT_VERSION, bytes))).toEqual(bytes)
  })
})
