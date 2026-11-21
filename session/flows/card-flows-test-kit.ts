import { CURRENT_SCHEMA_VERSION } from '../../core'
import type { DocumentStore, ProjectLockHold } from '../../storage'
import { renamed, soundProject } from '../../tests/storage/conformance/conformance-documents'
import { createTestPorts, placeDocument } from '../handle/handle-test-kit'
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
