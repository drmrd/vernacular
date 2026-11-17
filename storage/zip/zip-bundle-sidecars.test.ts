// @vitest-environment node
// Pure storage/zip logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createEmptyProject } from '../../core'
import type { Project } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { exportProjectBundle } from './export-project-bundle'
import { ZipBundleProjectStore } from './zip-bundle-project-store'
import { unzipFolder } from './zip-codec'

const ARCHIVE_ID = 'house'
const OLDER_VERSION = CURRENT_SCHEMA_VERSION - 1
const DOCUMENT_PATH = 'vernacular.json'
const BACKUP_PREFIX = '.house-backups/'
const SNAPSHOT_PREFIX = '.house-autosave/'
const ASSET_PREFIX = 'assets/'
const ASSET_HASH = 'ab'.repeat(32)
const ASSET_BYTES = Uint8Array.of(7, 8, 9)

function projectNamed(name: string): Project {
  return createEmptyProject({ name, units: 'metric', period: 'craftsman', appVersion: '0.1.0' })
}

function isSidecar(path: string): boolean {
  return path.startsWith(BACKUP_PREFIX) || path.startsWith(SNAPSHOT_PREFIX)
}

interface OpenedArchive {
  store: ZipBundleProjectStore
  directory: InMemoryDirectory
}

/**
 * An archive store over a document at an older schema version, after a load that migrated it
 * (so a backup exists), with one asset and one recovery snapshot.
 */
async function archiveWithBackupAndSnapshot(): Promise<OpenedArchive> {
  const directory = new InMemoryDirectory()
  await directory.writeFile(DOCUMENT_PATH, versionFixtureBytes(OLDER_VERSION))
  const store = new ZipBundleProjectStore(ARCHIVE_ID, directory)
  await store.load(ARCHIVE_ID)
  await store.assetCache().put(ASSET_HASH, ASSET_BYTES)
  await store.snapshots(ARCHIVE_ID).writeSnapshot(projectNamed('Edited'))
  return { store, directory }
}

describe('an archive that was opened and packed again', () => {
  it('carries no backup and no snapshot', async () => {
    const { store } = await archiveWithBackupAndSnapshot()
    const stored = [...(await store.storedFiles(ARCHIVE_ID)).keys()]
    expect(stored.filter((path) => path.startsWith(BACKUP_PREFIX))).toHaveLength(1)
    expect(stored.some((path) => path.startsWith(SNAPSHOT_PREFIX))).toBe(true)

    const entries = unzipFolder(await store.exportBundle())

    expect([...entries.keys()].filter(isSidecar)).toEqual([])
  })

  it('still carries the document and its assets, with the bytes that the store holds', async () => {
    const { store } = await archiveWithBackupAndSnapshot()
    const stored = await store.storedFiles(ARCHIVE_ID)

    const entries = unzipFolder(await store.exportBundle())

    expect(entries.get(DOCUMENT_PATH)).toEqual(stored.get(DOCUMENT_PATH))
    expect(entries.get(DOCUMENT_PATH)).toBeDefined()
    expect(entries.get(`${ASSET_PREFIX}${ASSET_HASH}`)).toEqual(ASSET_BYTES)
  })

  it('leaves the backup and the snapshots in the directory of the store after the export', async () => {
    const { store, directory } = await archiveWithBackupAndSnapshot()
    const before = [...(await store.storedFiles(ARCHIVE_ID)).keys()].sort()

    await store.exportBundle()

    expect([...(await store.storedFiles(ARCHIVE_ID)).keys()].sort()).toEqual(before)
    expect((await directory.list(BACKUP_PREFIX.slice(0, -1))).length).toBeGreaterThan(0)
    expect((await directory.list(SNAPSHOT_PREFIX.slice(0, -1))).length).toBeGreaterThan(0)
  })
})

describe('the archive that the application exports', () => {
  it('has the document and no backup or snapshot entry', async () => {
    const assets = new InMemoryAssetCache()

    const bytes = await exportProjectBundle(ARCHIVE_ID, projectNamed('Exported'), { assets })

    const paths = [...unzipFolder(bytes).keys()]
    expect(paths).toContain(DOCUMENT_PATH)
    expect(paths.filter(isSidecar)).toEqual([])
  })
})
