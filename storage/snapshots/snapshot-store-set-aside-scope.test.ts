// @vitest-environment node
// Pure storage logic; node aligns TextEncoder/Uint8Array realms with serialization.
import { describe, expect, it } from 'vitest'
import { PassThroughDirectory } from '../documents/document-store-test-kit'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import {
  AUTOSAVE_DIRECTORY,
  BACKUP_DIRECTORY,
  NOT_A_PROJECT_VERSION,
  backupPathOf,
  holding,
  notJson,
} from './snapshot-set-aside-test-kit'
import { SnapshotStore } from './snapshot-store'

const REFUSED_SNAPSHOT_COUNT = 3
const FAILING_BACKUP_WRITE = 2

/** Test support: rejects the backup write that is the `failingWrite`-th under the backup directory. */
class NthBackupRefusingDirectory extends PassThroughDirectory {
  private backupWrites = 0

  constructor(
    inner: InMemoryDirectory,
    private readonly failingWrite: number,
  ) {
    super(inner)
  }

  override writeFile(path: string, bytes: Uint8Array): Promise<void> {
    if (path.startsWith(`${BACKUP_DIRECTORY}/`)) {
      this.backupWrites += 1
      if (this.backupWrites === this.failingWrite)
        return Promise.reject(new Error('the disk is full'))
    }
    return super.writeFile(path, bytes)
  }
}

async function isHeld(directory: InMemoryDirectory, path: string): Promise<boolean> {
  return (await directory.readFile(path)) !== undefined
}

describe('SnapshotStore.setAsideRefused scope', () => {
  it('leaves a file that only looks like a snapshot in place and writes no backup for it', async () => {
    const foreignPath = `${AUTOSAVE_DIRECTORY}/snapshot-notes.txt`
    const bytes = notJson()
    const directory = await holding({ [foreignPath]: bytes })

    const moved = await new SnapshotStore(directory).setAsideRefused()

    expect(moved).toBe(0)
    expect(await directory.readFile(foreignPath)).toEqual(bytes)
    expect(await directory.list(BACKUP_DIRECTORY)).toEqual([])
  })

  it('still moves a snapshot file with a malformed timestamp that does not decode', async () => {
    const bytes = notJson()
    const directory = await holding({ [`${AUTOSAVE_DIRECTORY}/snapshot-x.json`]: bytes })

    const moved = await new SnapshotStore(directory).setAsideRefused()

    expect(moved).toBe(1)
    expect(await directory.readFile(backupPathOf(NOT_A_PROJECT_VERSION, bytes))).toEqual(bytes)
    expect(await directory.list(AUTOSAVE_DIRECTORY)).toEqual([])
  })
})

describe('SnapshotStore.setAsideRefused after a failed backup', () => {
  it('stops at the first failed backup: the earlier snapshots are moved, the failing one and the rest stay, and the call rejects', async () => {
    const refused = Array.from({ length: REFUSED_SNAPSHOT_COUNT }, (_, index) => ({
      path: `${AUTOSAVE_DIRECTORY}/snapshot-${index + 1}.json`,
      bytes: notJson(`refused snapshot ${index + 1}`),
    }))
    const inner = await holding(Object.fromEntries(refused.map((s) => [s.path, s.bytes])))
    const store = new SnapshotStore(new NthBackupRefusingDirectory(inner, FAILING_BACKUP_WRITE))

    await expect(store.setAsideRefused()).rejects.toThrow('the disk is full')

    const backedUp = await Promise.all(
      refused.map(({ bytes }) => isHeld(inner, backupPathOf(NOT_A_PROJECT_VERSION, bytes))),
    )
    const inPlace = await Promise.all(refused.map(({ path }) => isHeld(inner, path)))
    expect(backedUp.filter(Boolean)).toHaveLength(FAILING_BACKUP_WRITE - 1)
    expect(inPlace.filter(Boolean)).toHaveLength(REFUSED_SNAPSHOT_COUNT - FAILING_BACKUP_WRITE + 1)
    expect(inPlace).toEqual(backedUp.map((hasBackup) => !hasBackup))
    for (const [index, { bytes }] of refused.entries()) {
      if (backedUp[index])
        expect(await inner.readFile(backupPathOf(NOT_A_PROJECT_VERSION, bytes))).toEqual(bytes)
    }
  })
})
