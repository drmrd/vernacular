import { expect, vi } from 'vitest'
import { createFurnitureInstance, placeFurniture } from '../../core'
import type { InMemoryDirectory, ProjectRecord, WorkspaceDocumentStore } from '../../storage'
import { ASSET_DIRECTORY_PREFIX, assetPathFor } from '../../storage/directory-asset-cache'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import { AUTOSAVE_DIRECTORY } from '../../storage/snapshots/snapshot-store'
import { contentHashOf, projectReferring } from '../../storage/zip/zip-test-kit'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import { createTestPorts, rememberFolder } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import type { DocumentHandle } from '../handle/handle-types'
import { folderRecord } from '../projects/rebuild-test-kit'
import { reconcileIndex } from '../projects/reconcile-index'
import { FIRST_ID, SECOND_ID } from './card-flows-test-kit'

/** Test support: the asset pool, projects that use given assets, and steps that fail, for the flows that remove a project. */

const encoder = new TextEncoder()
const PIECE_PLACE = { position: { x: 0, y: 0 }, footprint: { width: 600, depth: 600 } }
const SETTLE_ROUNDS = 20

/** The id of the project that a test of a folder project remembers. */
export const FOLDER_ID = 'in-a-folder'

/** A library that holds no asset. */
export const EMPTY_LIBRARY: ReadonlySet<string> = new Set()

/** Puts bytes that depend on `label` into the shared pool of the workspace. Gives their content hash. */
export async function putInPool(ports: TestPorts, label: string): Promise<string> {
  const bytes = encoder.encode(`the bytes of the asset ${label}`)
  const hash = await contentHashOf(bytes)
  await ports.root.writeFile(assetPathFor(hash), bytes)
  return hash
}

/** The content hash of every asset in the pool, in order. */
export async function poolHashes(ports: TestPorts): Promise<string[]> {
  return (await ports.root.list(ASSET_DIRECTORY_PREFIX)).sort()
}

/** The hashes in order, as `poolHashes` gives them. */
export function inOrder(hashes: readonly string[]): string[] {
  return [...hashes].sort()
}

/** Stores a project under `id` that places a piece of furniture for each hash, and gives it a record. */
export async function storeUsing(
  ports: TestPorts,
  id: string,
  hashes: readonly string[],
): Promise<void> {
  const references = hashes.map((contentHash) => ({ scope: 'user' as const, contentHash }))
  await ports.workspace.save(id, projectReferring(references))
  await reconcileIndex(ports)
}

export interface SharedScenario {
  readonly ports: TestPorts
  /** The hash that only the first project uses. */
  readonly only: string
  /** The hash that both projects use. */
  readonly shared: string
}

/**
 * Two stored projects with records. `FIRST_ID` uses `only` and `shared`, and `SECOND_ID` uses
 * `shared`. The pool holds both assets.
 */
export async function sharedScenario(): Promise<SharedScenario> {
  const ports = createTestPorts()
  const only = await putInPool(ports, 'only the first project uses')
  const shared = await putInPool(ports, 'both projects use')
  await storeUsing(ports, FIRST_ID, [only, shared])
  await storeUsing(ports, SECOND_ID, [shared])
  return { ports, only, shared }
}

/** Stores the record of `id` again with `changes`. Throws when the index holds no record of `id`. */
export async function changeRecord(
  ports: TestPorts,
  id: string,
  changes: Partial<ProjectRecord>,
): Promise<void> {
  const record = await ports.index.get(id)
  if (record === undefined) throw new Error(`Expected a record of ${id}`)
  await ports.index.put({ ...record, ...changes })
}

/** Remembers a folder under `FOLDER_ID` that holds a sound document, and gives it a record. */
export async function storeFolderProject(ports: TestPorts): Promise<InMemoryDirectory> {
  const directory = await rememberFolder(ports, FOLDER_ID, currentBytes())
  await ports.index.put(folderRecord(FOLDER_ID))
  return directory
}

/** Places a piece of furniture that uses the asset `contentHash` in the open project, as an edit does. */
export function placeFurnitureUsing(handle: DocumentHandle, contentHash: string): void {
  const floor = handle.session.getProject().floors[0]
  if (floor === undefined) throw new Error('Expected the open project to have a floor')
  const piece = createFurnitureInstance({
    assetRef: { scope: 'user', contentHash },
    ...PIECE_PLACE,
  })
  handle.session.dispatch(placeFurniture(floor.id, piece))
}

/** Every stored file of the workspace and every record of the index, for a comparison byte for byte. */
export async function everythingStored(ports: TestPorts) {
  await settle()
  return { files: await treeOf(ports.root), records: await ports.index.all() }
}

/**
 * Expects the stored state to hold every file and record of `before` unchanged, and no other file
 * than recovery files under `<openId>/<AUTOSAVE_DIRECTORY>/`, which the save of the open project writes.
 */
export async function expectOnlyRecoveryFilesAdded(
  ports: TestPorts,
  before: Awaited<ReturnType<typeof everythingStored>>,
  openId: string,
): Promise<void> {
  const after = await everythingStored(ports)
  const recoveryPrefix = `${openId}/${AUTOSAVE_DIRECTORY}/`
  const kept = Object.fromEntries(
    Object.keys(before.files).map((path) => [path, after.files[path]]),
  )
  const added = Object.keys(after.files).filter((path) => !(path in before.files))
  expect(kept).toEqual(before.files)
  expect(added.filter((path) => !path.startsWith(recoveryPrefix))).toEqual([])
  expect(after.records).toEqual(before.records)
}

export interface DeleteHold {
  /** Resolves when the store has been asked to delete. Throws when it never is. */
  whenStarted(): Promise<void>
  /** Lets the held delete, and each later one, run against the real store. */
  release(): void
}

/** From now on the next delete of the store stays pending until the test releases it. */
export function holdNextDelete(store: WorkspaceDocumentStore): DeleteHold {
  const realDelete = store.delete.bind(store)
  let started = false
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  store.delete = async (id) => {
    started = true
    await gate
    return realDelete(id)
  }
  return {
    whenStarted: async () => {
      for (let round = 0; round < SETTLE_ROUNDS && !started; round += 1) await settle()
      if (!started) throw new Error('The store was never asked to delete')
    },
    release: () => release(),
  }
}

/** From now on the store runs `probe` each time it is asked to delete, before it deletes. */
export function beforeStoreDelete(
  store: WorkspaceDocumentStore,
  probe: () => Promise<unknown>,
): void {
  const realDelete = store.delete.bind(store)
  store.delete = async (id) => {
    await probe()
    return realDelete(id)
  }
}

/** A step of the ports that a test can make fail once. */
export type PortStep =
  | 'listStore'
  | 'readIndex'
  | 'readRecord'
  | 'takeLock'
  | 'removeDocument'
  | 'removeRecord'
  | 'removeAssets'
  | 'forgetFolder'

/** The steps of a delete that can fail, in the order a delete runs them: the record, the lock, the users, then the removals. */
export const STEPS_OF_A_DELETE: readonly PortStep[] = [
  'readRecord',
  'takeLock',
  'listStore',
  'readIndex',
  'removeDocument',
  'removeRecord',
  'removeAssets',
]

/** The next call of `step` rejects with the error that this gives back. Each call after it works as before. */
export function failOnce(ports: TestPorts, step: PortStep): Error {
  const error = new Error(`the step ${step} failed`)
  const failures: Record<PortStep, () => void> = {
    listStore: () => void vi.spyOn(ports.workspace, 'list').mockRejectedValueOnce(error),
    readIndex: () => void vi.spyOn(ports.index, 'all').mockRejectedValueOnce(error),
    readRecord: () => void vi.spyOn(ports.index, 'get').mockRejectedValueOnce(error),
    takeLock: () => void vi.spyOn(ports.locks, 'tryAcquire').mockRejectedValueOnce(error),
    removeDocument: () => void vi.spyOn(ports.workspace, 'delete').mockRejectedValueOnce(error),
    removeRecord: () => void vi.spyOn(ports.index, 'remove').mockRejectedValueOnce(error),
    removeAssets: () => void vi.spyOn(ports.workspace, 'removeAssets').mockRejectedValueOnce(error),
    forgetFolder: () => void vi.spyOn(ports.folders, 'forget').mockRejectedValueOnce(error),
  }
  failures[step]()
  return error
}
