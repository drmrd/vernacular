// @vitest-environment node
// Pure storage logic; node aligns TextEncoder/Uint8Array realms with serialization.
import { describe, expect, it } from 'vitest'
import { PassThroughDirectory } from '../documents/document-store-test-kit'
import { createProjectSnapshots } from '../documents/project-snapshots'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { SnapshotStore } from './snapshot-store'

const AUTOSAVE_DIRECTORY = '.house-autosave'
const BACKUP_DIRECTORY = '.house-backups'
const GONE_PATH = `${AUTOSAVE_DIRECTORY}/snapshot-1.json`
const REFUSED_PATH = `${AUTOSAVE_DIRECTORY}/snapshot-2.json`

/** Test support: still lists the snapshot at `GONE_PATH`, but reads nothing there. */
class VanishingSnapshotDirectory extends PassThroughDirectory {
  override readFile(path: string): Promise<Uint8Array | undefined> {
    if (path === GONE_PATH) return Promise.resolve(undefined)
    return super.readFile(path)
  }
}

function notJson(): Uint8Array {
  return new TextEncoder().encode('{"this is": not json')
}

async function holding(files: Record<string, Uint8Array>): Promise<InMemoryDirectory> {
  const directory = new InMemoryDirectory()
  for (const [path, bytes] of Object.entries(files)) await directory.writeFile(path, bytes)
  return directory
}

describe('SnapshotStore.setAsideRefused over a snapshot that is gone at read time', () => {
  it('skips the snapshot that reads as gone, writes no backup for it, and still moves the rest', async () => {
    const inner = await holding({ [GONE_PATH]: notJson(), [REFUSED_PATH]: notJson() })
    const store = new SnapshotStore(new VanishingSnapshotDirectory(inner))

    expect(await store.setAsideRefused()).toBe(1)

    expect(await inner.list(BACKUP_DIRECTORY)).toHaveLength(1)
    expect((await inner.list(AUTOSAVE_DIRECTORY)).sort()).toEqual(['snapshot-1.json'])
  })
})

describe('createProjectSnapshots(...).setAsideRefused', () => {
  it('moves the snapshots of the project that do not decode to its backups and resolves with the count', async () => {
    const bytes = notJson()
    const directory = await holding({ [REFUSED_PATH]: bytes })

    expect(await createProjectSnapshots(directory).setAsideRefused()).toBe(1)

    expect(await directory.list(AUTOSAVE_DIRECTORY)).toEqual([])
    const backups = await directory.list(BACKUP_DIRECTORY)
    const backupBytes = await Promise.all(
      backups.map((name) => directory.readFile(`${BACKUP_DIRECTORY}/${name}`)),
    )
    expect(backupBytes).toEqual([bytes])
  })
})
