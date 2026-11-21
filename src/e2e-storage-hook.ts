import { CURRENT_SCHEMA_VERSION, createEmptyProject, createFloor, type Project } from '../core'
import {
  ASSET_DIRECTORY_PREFIX,
  createOpfsProjectStore,
  FileSystemDirectory,
  IndexedDbProjectIndex,
  OpfsProjectStore,
  WebLocksProjectLockPort,
  originPrivateRoot,
  type DirectoryPort,
  type ProjectRecord,
} from '../storage'

// End-to-end validation seam for the durable browser adapters (OPFS, the IndexedDB
// project index, Web Locks). jsdom cannot exercise these, so a Playwright spec
// drives them through this hook. It is loaded only via a dynamic import guarded
// by the `e2e-storage` query parameter (see src/main.tsx), so it never ships in
// a normal page load.

// The id that earlier builds gave the project of an empty browser. The recovery checks plant
// their files under it, as a browser that ran such a build still holds them. A browser with no
// project index lists the projects of its store, so the start finds a project planted here.
const EARLIER_START_PROJECT_ID = 'current'

interface OpfsRoundTripResult {
  loadedName: string
  listedId: boolean
  floorCount: number
  deletedGone: boolean
}

interface IndexRoundTripResult {
  readName: string | null
  readFloorCount: number | null
  removedGone: boolean
}

interface LockSequenceResult {
  first: boolean
  second: boolean
  reacquired: boolean
}

export interface VernacularE2eStorage {
  opfsRoundTrip(): Promise<OpfsRoundTripResult>
  indexRoundTrip(): Promise<IndexRoundTripResult>
  lockSequence(): Promise<LockSequenceResult>
  opfsPersistSave(): Promise<void>
  opfsPersistName(): Promise<string>
  plantRecoverySnapshot(): Promise<boolean>
  plantProjectFromNewerBuild(): Promise<boolean>
  storedFilesOfProject(id: string): Promise<Record<string, string>>
  storedProjectIds(): Promise<string[]>
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
async function readStoredProject(store: OpfsProjectStore, id: string): Promise<Project> {
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

const INDEX_ROUND_TRIP_ID = 'e2e-index'
const INDEX_ROUND_TRIP_DATABASE = 'vernacular-index-e2e-round-trip'

const indexRoundTripRecord: ProjectRecord = {
  id: INDEX_ROUND_TRIP_ID,
  location: { kind: 'workspace' },
  name: 'Indexed House',
  floorCount: 1,
  preview: undefined,
  assetHashes: [],
  assetListComplete: true,
  lastChangedAt: undefined,
  lastUsedAt: undefined,
  lastOpen: { opened: true, build: 'e2e' },
}

// Puts a record through one index, reads it through a second one on the same database, then
// removes it and reads again, so the record is shown to persist beyond the instance that wrote it.
// The round trip uses a database of its own: the application on the same page rebuilds the
// project index, and that rebuild drops a workspace record that the store does not list.
async function indexRoundTrip(): Promise<IndexRoundTripResult> {
  const writer = new IndexedDbProjectIndex(INDEX_ROUND_TRIP_DATABASE)
  await writer.put(indexRoundTripRecord)
  const reader = new IndexedDbProjectIndex(INDEX_ROUND_TRIP_DATABASE)
  const read = await reader.get(INDEX_ROUND_TRIP_ID)
  await writer.remove(INDEX_ROUND_TRIP_ID)
  const afterRemove = await reader.get(INDEX_ROUND_TRIP_ID)
  return {
    readName: read?.name ?? null,
    readFloorCount: read?.floorCount ?? null,
    removedGone: afterRemove === undefined,
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

// Simulates a crash of a project that was saved once: store its document, then write a recovery
// snapshot of later work through the durable store and leave it there (no store save and no prune
// follows). A later production page load starts in the stored project, and the snapshots of its
// handle offer the recovery. Gives false when the durable store cannot be built.
async function plantRecoverySnapshot(): Promise<boolean> {
  let store: OpfsProjectStore
  try {
    store = await createOpfsProjectStore()
  } catch {
    return false
  }
  await store.save(EARLIER_START_PROJECT_ID, sampleProject('Saved House'))
  await store.snapshots(EARLIER_START_PROJECT_ID).writeSnapshot(sampleProject('Recovered House'))
  return true
}

// The OPFS root the durable project store keeps each project's folder in.
async function opfsRoot(): Promise<DirectoryPort> {
  return new FileSystemDirectory(await originPrivateRoot())
}

// Plants a project written by a newer build in the folder of the earlier start id:
// it lists by name, but this build cannot open it. Reports whether the durable
// store sees it under that id, so a wrong path fails loudly.
async function plantProjectFromNewerBuild(): Promise<boolean> {
  const project = sampleProject('Newer Build House')
  const newer = { ...project, meta: { ...project.meta, schemaVersion: CURRENT_SCHEMA_VERSION + 1 } }
  const root = await opfsRoot()
  await root.writeFile(
    `${EARLIER_START_PROJECT_ID}/vernacular.json`,
    new TextEncoder().encode(JSON.stringify(newer)),
  )
  const summaries = await (await createOpfsProjectStore()).list()
  return summaries.some((summary) => summary.id === EARLIER_START_PROJECT_ID)
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

// Every stored file of the project with the given id, keyed by its path from the root.
async function storedFilesOfProject(id: string): Promise<Record<string, string>> {
  return filesUnder(await opfsRoot(), id)
}

// The name of every project folder in the root, apart from the shared asset pool, in sorted order.
// A folder is listed also when it holds no document, so a stray write of any kind shows.
async function storedProjectIds(): Promise<string[]> {
  const names = await (await opfsRoot()).list('')
  return names.filter((name) => name !== ASSET_DIRECTORY_PREFIX).sort()
}

/** Attach the durable-adapter test routines to window for the Playwright spec. */
export function install(): void {
  window.vernacularE2eStorage = {
    opfsRoundTrip,
    indexRoundTrip,
    lockSequence,
    opfsPersistSave,
    opfsPersistName,
    plantRecoverySnapshot,
    plantProjectFromNewerBuild,
    storedFilesOfProject,
    storedProjectIds,
  }
}
