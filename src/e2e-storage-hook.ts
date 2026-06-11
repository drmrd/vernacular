import { createEmptyProject, createFloor, type Project } from '../core'
import { createOpfsProjectStore, IndexedDbRecentProjectStore, WebLocksManager } from '../storage'

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

async function opfsRoundTrip(): Promise<OpfsRoundTripResult> {
  const store = await createOpfsProjectStore()
  await store.save('e2e-roundtrip', sampleProject('Round Trip House'))
  const loaded = await store.load('e2e-roundtrip')
  const summaries = await store.list()
  await store.delete('e2e-roundtrip')
  let deletedGone = false
  try {
    await store.load('e2e-roundtrip')
  } catch {
    deletedGone = true
  }
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
  const manager = new WebLocksManager()
  const first = await manager.tryAcquire('e2e-lock')
  const second = await manager.tryAcquire('e2e-lock')
  await manager.release('e2e-lock')
  const reacquired = await manager.tryAcquire('e2e-lock')
  await manager.release('e2e-lock')
  return { first, second, reacquired }
}

async function opfsPersistSave(): Promise<void> {
  const store = await createOpfsProjectStore()
  await store.save(PERSIST_ID, sampleProject('Persisted House'))
}

async function opfsPersistName(): Promise<string> {
  const store = await createOpfsProjectStore()
  const loaded = await store.load(PERSIST_ID)
  return loaded.meta.name
}

/** Attach the durable-adapter test routines to window for the Playwright spec. */
export function install(): void {
  window.vernacularE2eStorage = {
    opfsRoundTrip,
    recentRoundTrip,
    lockSequence,
    opfsPersistSave,
    opfsPersistName,
  }
}
