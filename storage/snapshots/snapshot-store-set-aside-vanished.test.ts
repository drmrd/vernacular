// @vitest-environment node
// Pure storage logic; node aligns TextEncoder/Uint8Array realms with serialization.
import { describe, expect, it } from 'vitest'
import { PassThroughDirectory } from '../documents/document-store-test-kit'
import { createProjectSnapshots } from '../documents/project-snapshots'
import { SnapshotStore } from './snapshot-store'
import {
  AUTOSAVE_DIRECTORY,
  BACKUP_DIRECTORY,
  NOT_A_PROJECT_VERSION,
  backupPathOf,
  holding,
  notJson,
} from './snapshot-set-aside-test-kit'

const GONE_PATH = `${AUTOSAVE_DIRECTORY}/snapshot-1.json`
const REFUSED_PATH = `${AUTOSAVE_DIRECTORY}/snapshot-2.json`

/** Test support: still lists the snapshot at `GONE_PATH`, but reads nothing there. */
class VanishingSnapshotDirectory extends PassThroughDirectory {
  override readFile(path: string): Promise<Uint8Array | undefined> {
    if (path === GONE_PATH) return Promise.resolve(undefined)
    return super.readFile(path)
  }
}

describe('SnapshotStore.setAsideRefused over a snapshot that is gone at read time', () => {
  it('skips the snapshot that reads as gone, writes no backup for it, and still moves the rest', async () => {
    const inner = await holding({ [GONE_PATH]: notJson(), [REFUSED_PATH]: notJson() })
    const store = new SnapshotStore(new VanishingSnapshotDirectory(inner))

    expect(await store.setAsideRefused()).toBe(1)

    expect(await inner.list(BACKUP_DIRECTORY)).toHaveLength(1)
    expect(await inner.list(AUTOSAVE_DIRECTORY)).toEqual(['snapshot-1.json'])
  })
})

describe('createProjectSnapshots(...).setAsideRefused', () => {
  it('moves the snapshots of the project that do not decode to its backups and resolves with the count', async () => {
    const bytes = notJson()
    const directory = await holding({ [REFUSED_PATH]: bytes })

    expect(await createProjectSnapshots(directory).setAsideRefused()).toBe(1)

    expect(await directory.list(AUTOSAVE_DIRECTORY)).toEqual([])
    expect(await directory.readFile(backupPathOf(NOT_A_PROJECT_VERSION, bytes))).toEqual(bytes)
  })
})
