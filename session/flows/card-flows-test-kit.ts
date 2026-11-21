import { CURRENT_SCHEMA_VERSION } from '../../core'
import type { Project } from '../../core'
import { ZipBundleProjectStore } from '../../storage'
import type { DocumentStore, ProjectLockHold } from '../../storage'
import { BACKUP_DIRECTORY } from '../../storage/documents/document-backups'
import { AUTOSAVE_DIRECTORY } from '../../storage/snapshots/snapshot-store'
import { unzipFolder } from '../../storage/zip/zip-codec'
import { renamed, soundProject } from '../../tests/storage/conformance/conformance-documents'
import {
  IN_WORKSPACE,
  createTestPorts,
  placeDocument,
  storedProject,
} from '../handle/handle-test-kit'
import type { TestPorts, TestPortsOptions } from '../handle/handle-test-kit'
import { reconcileIndex } from '../projects/reconcile-index'

/** Test support: stored projects, byte comparisons, and a second tab, for the flows of a card. */

export const FIRST_ID = 'first'
export const SECOND_ID = 'second'
export const FIRST_NAME = 'First House'
export const SECOND_NAME = 'Second House'

/** The files of each project, by project id and then by path inside the project. */
export type StoredBytes = ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>

/** Stores two sound projects, `FIRST_ID` and `SECOND_ID`, in the workspace of `ports`, each with a record. */
export async function storeTwoProjectsIn(ports: TestPorts): Promise<TestPorts> {
  await ports.workspace.save(FIRST_ID, renamed(soundProject(), FIRST_NAME))
  await ports.workspace.save(SECOND_ID, renamed(soundProject(), SECOND_NAME))
  await reconcileIndex(ports)
  return ports
}

/** New ports whose workspace holds the two projects of `storeTwoProjectsIn`. */
export function storeTwoProjects(options: TestPortsOptions = {}): Promise<TestPorts> {
  return storeTwoProjectsIn(createTestPorts(options))
}

/** Stores a document under `id` that this build cannot open, because a newer build wrote it. */
export function placeProjectThatDoesNotOpen(ports: TestPorts, id: string): Promise<void> {
  const project = soundProject()
  const newer = { ...project, meta: { ...project.meta, schemaVersion: CURRENT_SCHEMA_VERSION + 1 } }
  return placeDocument(ports, id, new TextEncoder().encode(JSON.stringify(newer)))
}

/** Every stored file of each project in `ids`, for a comparison byte for byte. */
export async function storedBytesOf(
  ports: TestPorts,
  ids: readonly string[],
): Promise<StoredBytes> {
  const stored = new Map<string, ReadonlyMap<string, Uint8Array>>()
  for (const id of ids) {
    stored.set(id, await ports.workspace.storedFiles(id))
  }
  return stored
}

/** The ports of a second tab of the browser: the same files, index, and locks. */
export function secondTabOf(ports: TestPorts): TestPorts {
  const { root, lockRegistry, index } = ports
  return createTestPorts({ root, lockRegistry, index, durable: ports.workspace.durable })
}

/** Makes a second tab hold the lock of `id`. Gives its hold, which the test may release. */
export async function holdInSecondTab(ports: TestPorts, id: string): Promise<ProjectLockHold> {
  const hold = await secondTabOf(ports).locks.tryAcquire(id)
  if (hold === undefined) throw new Error(`The lock of ${id} is held already`)
  return hold
}

/** The error that a failed save of `failTheNextSave` rejects with. */
export const DISK_FULL = 'disk full'

/** The next save of the store rejects with `DISK_FULL`. Each save after it works as before. */
export function failTheNextSave(store: DocumentStore): void {
  const realSave = store.save.bind(store)
  store.save = () => {
    store.save = realSave
    return Promise.reject(new Error(DISK_FULL))
  }
}

/** The id and the name of the stored project that this build cannot open, as `storeProjectThatDoesNotOpen` makes it. */
export const NEWER_ID = 'from-a-newer-build'
export const NEWER_NAME = 'Newer House'

/** The recovery snapshot and the backup that `addRecoveryFiles` puts in a project, by path inside the project. */
export const SNAPSHOT_PATH = `${AUTOSAVE_DIRECTORY}/crash.json`
export const BACKUP_PATH = `${BACKUP_DIRECTORY}/before-migration.json`

/**
 * Stores a document that this build cannot open under `NEWER_ID`, with recovery files, and gives it
 * a record that names it `NEWER_NAME` and lists `assetHashes`, as the index of a browser holds one.
 */
export async function storeProjectThatDoesNotOpen(
  ports: TestPorts,
  assetHashes: readonly string[] = [],
): Promise<void> {
  await placeProjectThatDoesNotOpen(ports, NEWER_ID)
  await addRecoveryFiles(ports, NEWER_ID)
  await ports.index.put({
    id: NEWER_ID,
    location: IN_WORKSPACE,
    name: NEWER_NAME,
    floorCount: undefined,
    preview: undefined,
    assetHashes,
    assetListComplete: true,
    lastChangedAt: undefined,
    lastUsedAt: undefined,
    lastOpen: { opened: false, build: ports.build, reason: 'schema-too-new' },
  })
}

/** Puts a recovery snapshot and a backup into the directory of the project `id`, as a crash and a migration leave them. */
export async function addRecoveryFiles(ports: TestPorts, id: string): Promise<void> {
  const encoder = new TextEncoder()
  await ports.root.writeFile(`${id}/${SNAPSHOT_PATH}`, encoder.encode('a snapshot after a crash'))
  await ports.root.writeFile(`${id}/${BACKUP_PATH}`, encoder.encode('a backup before a migration'))
}

/** The files of an archive, by path. */
export function filesOfArchive(archive: Uint8Array): ReadonlyMap<string, Uint8Array> {
  return unzipFolder(archive)
}

const ARCHIVE_ID = 'archive'

/** The project that an archive holds. */
export async function projectOfArchive(archive: Uint8Array): Promise<Project> {
  return storedProject(await ZipBundleProjectStore.fromBundle(ARCHIVE_ID, archive), ARCHIVE_ID)
}
