import { DEFAULT_PROJECT_ID, resolveSnapshotStore } from '../app'
import { CURRENT_SCHEMA_VERSION, createEmptyProject, createFloor, type Project } from '../core'
import {
  createOpfsProjectStore,
  FileSystemDirectory,
  IndexedDbRecentProjectStore,
  WebLocksProjectLockPort,
  type DirectoryPort,
} from '../storage'

// End-to-end validation seam for the durable browser adapters (OPFS, IndexedDB
// recent list, Web Locks). jsdom cannot exercise these, so a Playwright spec
// drives them through this hook. It is loaded only via a dynamic import guarded
// by the `e2e-storage` query parameter (see src/main.tsx), so it never ships in
// a normal page load.

interface OpfsRoundTripResult {
  loadedName: string
  listedId: boolean
  floorCount: number
  deletedGone: boolean
}

interface RecentRoundTripResult {
  recordedName: string | null
  recordedBackend: string | null
  removedGone: boolean
}

interface LockSequenceResult {
  first: boolean
  second: boolean
  reacquired: boolean
}

export interface VernacularE2eStorage {
  opfsRoundTrip(): Promise<OpfsRoundTripResult>
  recentRoundTrip(): Promise<RecentRoundTripResult>
  lockSequence(): Promise<LockSequenceResult>
  opfsPersistSave(): Promise<void>
  opfsPersistName(): Promise<string>
  plantRecoverySnapshot(): Promise<boolean>
  plantProjectFromNewerBuild(): Promise<boolean>
  storedFilesOfDefaultProject(): Promise<Record<string, string>>
}

declare global {
  interface Window {
    vernacularE2eStorage?: VernacularE2eStorage
  }
}

const PERSIST_ID = 'e2e-persist'

function sampleProject(name: string): Project {
  const project = createEmptyProject({
    name,
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  return { ...project, floors: [createFloor('Ground')] }
}

// The stored project, or a rejection that names why the read gave none.
async function readStoredProject(
  store: Awaited<ReturnType<typeof createOpfsProjectStore>>,
  id: string,
): Promise<Project> {
  const read = await store.read(id)
  if (!read.ok) {
    throw new Error(`The project ${id} could not be read: ${read.failure.kind}`)
  }
  return read.value.project
}

async function opfsRoundTrip(): Promise<OpfsRoundTripResult> {
  const store = await createOpfsProjectStore()
  await store.save('e2e-roundtrip', sampleProject('Round Trip House'))
  const loaded = await readStoredProject(store, 'e2e-roundtrip')
  const summaries = await store.list()
  await store.delete('e2e-roundtrip')
  const afterDelete = await store.read('e2e-roundtrip')
  const deletedGone = !afterDelete.ok && afterDelete.failure.kind === 'not-found'
  return {
    loadedName: loaded.meta.name,
    listedId: summaries.some((summary) => summary.id === 'e2e-roundtrip'),
    floorCount: loaded.floors.length,
    deletedGone,
  }
}

async function recentRoundTrip(): Promise<RecentRoundTripResult> {
  const recent = new IndexedDbRecentProjectStore()
  await recent.remove('e2e-recent')
  await recent.record({ id: 'e2e-recent', name: 'Recent House', backend: 'opfs', lastOpened: 123 })
  const listed = await recent.list()
  const entry = listed.find((candidate) => candidate.id === 'e2e-recent')
  await recent.remove('e2e-recent')
  const after = await recent.list()
  return {
    recordedName: entry?.name ?? null,
    recordedBackend: entry?.backend ?? null,
    removedGone: !after.some((candidate) => candidate.id === 'e2e-recent'),
  }
}

async function lockSequence(): Promise<LockSequenceResult> {
  const locks = new WebLocksProjectLockPort()
  const firstHold = await locks.tryAcquire('e2e-lock')
  const secondHold = await locks.tryAcquire('e2e-lock')
  await firstHold?.release()
  const thirdHold = await locks.tryAcquire('e2e-lock')
  await thirdHold?.release()
  return {
    first: firstHold !== undefined,
    second: secondHold !== undefined,
    reacquired: thirdHold !== undefined,
  }
}

async function opfsPersistSave(): Promise<void> {
  const store = await createOpfsProjectStore()
  await store.save(PERSIST_ID, sampleProject('Persisted House'))
}

async function opfsPersistName(): Promise<string> {
  const store = await createOpfsProjectStore()
  const loaded = await readStoredProject(store, PERSIST_ID)
  return loaded.meta.name
}

// Simulates a crash: write a recovery snapshot at the production project's OPFS
// location and leave it there (no canonical save + prune follows). A subsequent
// production page load resolves the same snapshot store and should offer recovery.
async function plantRecoverySnapshot(): Promise<boolean> {
  const snapshots = await resolveSnapshotStore(DEFAULT_PROJECT_ID)
  if (snapshots === undefined) {
    return false
  }
  await snapshots.writeSnapshot(sampleProject('Recovered House'))
  return true
}

// The OPFS root the durable project store keeps each project's folder in.
async function opfsRoot(): Promise<DirectoryPort> {
  return new FileSystemDirectory(await navigator.storage.getDirectory())
}

// Plants a project written by a newer build at the production project's OPFS
// location: it lists by name, but this build cannot open it. Reports whether the
// durable store sees it under the default id, so a wrong path fails loudly.
async function plantProjectFromNewerBuild(): Promise<boolean> {
  const project = sampleProject('Newer Build House')
  const newer = { ...project, meta: { ...project.meta, schemaVersion: CURRENT_SCHEMA_VERSION + 1 } }
  const root = await opfsRoot()
  await root.writeFile(
    `${DEFAULT_PROJECT_ID}/vernacular.json`,
    new TextEncoder().encode(JSON.stringify(newer)),
  )
  const summaries = await (await createOpfsProjectStore()).list()
  return summaries.some((summary) => summary.id === DEFAULT_PROJECT_ID)
}

// Every file below `prefix`, keyed by path. A listing of a file is empty and a
// read of a directory is undefined, which tells the two apart. The fatal decoder
// keeps the byte order mark, so equal text means equal bytes.
async function filesUnder(root: DirectoryPort, prefix: string): Promise<Record<string, string>> {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  const files: Record<string, string> = {}
  for (const name of await root.list(prefix)) {
    const path = `${prefix}/${name}`
    const bytes = await root.readFile(path)
    Object.assign(files, bytes ? { [path]: decoder.decode(bytes) } : await filesUnder(root, path))
  }
  return files
}

async function storedFilesOfDefaultProject(): Promise<Record<string, string>> {
  return filesUnder(await opfsRoot(), DEFAULT_PROJECT_ID)
}

/** Attach the durable-adapter test routines to window for the Playwright spec. */
export function install(): void {
  window.vernacularE2eStorage = {
    opfsRoundTrip,
    recentRoundTrip,
    lockSequence,
    opfsPersistSave,
    opfsPersistName,
    plantRecoverySnapshot,
    plantProjectFromNewerBuild,
    storedFilesOfDefaultProject,
  }
}
