import {
  CURRENT_SCHEMA_VERSION,
  createPlanPreview,
  encodeDocument,
  readStoredFacts,
} from '../../core'
import { InMemoryDirectory } from '../../storage'
import type { ProjectIndex, ProjectRecord } from '../../storage'
import { renamed, soundProject } from '../../tests/storage/conformance/conformance-documents'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
  projectOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'
import { IN_FOLDER, IN_WORKSPACE, createTestPorts, placeDocument } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'

/** Shared set-up of the tests that rebuild the project index from the stored projects. */

/** The build that the ports of these tests write into each record. */
export const REBUILD_BUILD = 'build-of-the-rebuild-tests'

/** The time at which the store wrote every document of these tests. */
export const STORED_AT = '2026-11-01T09:00:00.000Z'

/** A time of change other than the store's, as the record of an older save has it. */
export const EARLIER_CHANGE = '2026-10-01T08:00:00.000Z'

/** A time of use that a record of the index holds. */
export const USED_AT = '2026-10-15T18:30:00.000Z'

/** The clock of the ports. No rebuilt record takes this time. */
const PORTS_NOW = '2026-11-05T12:00:00.000Z'

const HASH_BYTE_COUNT = 32

/** The content hash of an asset that only a document of a later build refers to. */
export const LATER_BUILD_HASH = 'cd'.repeat(HASH_BYTE_COUNT)

export interface RebuildPortsOptions {
  /** The directory of earlier ports, as a reload of the same browser has it. */
  readonly root?: InMemoryDirectory
  /** The index of the ports; a new in-memory index when none is given. */
  readonly index?: ProjectIndex
  /** Whether the workspace keeps its projects after the tab closes; not durable when none is given. */
  readonly durable?: boolean
}

/** Test ports whose store stamps every write with `STORED_AT` and whose build is fixed. */
export function rebuildPorts(options: RebuildPortsOptions = {}): TestPorts {
  const storeClock = () => new Date(STORED_AT)
  return createTestPorts({
    root: options.root ?? new InMemoryDirectory({ now: storeClock }),
    durable: options.durable ?? false,
    build: REBUILD_BUILD,
    now: () => new Date(PORTS_NOW),
    ...(options.index === undefined ? {} : { index: options.index }),
  })
}

/** The stored bytes of a sound document of the current version, named `name`. */
export function documentNamed(name: string): Uint8Array {
  return encodeDocument(renamed(soundProject(), name), undefined).bytes
}

/** The stored bytes of the sound document that `placeSound` places under `id`. */
export function soundDocumentOf(id: string): Uint8Array {
  return documentNamed(`House ${id}`)
}

/** Places a sound document under each id, named "House <id>". */
export async function placeSound(ports: TestPorts, ids: readonly string[]): Promise<void> {
  for (const id of ids) await placeDocument(ports, id, soundDocumentOf(id))
}

/** Bytes that are not JSON at all. */
export function notJsonBytes(): Uint8Array {
  return new TextEncoder().encode('this is not a project document {')
}

/** A document of a schema version above this build's, named `name`, that refers to `LATER_BUILD_HASH`. */
export function documentOfNewerVersion(name: string): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  const meta = metaOf(document)
  meta.schemaVersion = CURRENT_SCHEMA_VERSION + 1
  meta.name = name
  const floors = document.floors as { furniture: Json[] }[]
  floors[0]?.furniture.push({
    id: 'piece-of-a-later-build',
    assetRef: { scope: 'user', contentHash: LATER_BUILD_HASH },
  })
  return bytesOf(document)
}

/** The whole record that a rebuild makes for the sound document `bytes` of the workspace project `id`. */
export function soundRecord(
  id: string,
  bytes: Uint8Array,
  overrides: Partial<ProjectRecord> = {},
): ProjectRecord {
  const project = projectOf(bytes)
  return {
    id,
    location: IN_WORKSPACE,
    name: project.meta.name,
    floorCount: project.floors.length,
    preview: createPlanPreview(project),
    assetHashes: readStoredFacts(bytes).assetHashes,
    assetListComplete: true,
    lastChangedAt: STORED_AT,
    lastUsedAt: STORED_AT,
    lastOpen: { opened: true, build: REBUILD_BUILD },
    ...overrides,
  }
}

/** The whole record that a rebuild makes for the sound document that `placeSound` placed under `id`. */
export function soundRecordOf(id: string, overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return soundRecord(id, soundDocumentOf(id), overrides)
}

/** The whole record that a rebuild makes for the document `bytes` of `id`, which did not open for `reason`. */
export function failedRecord(id: string, bytes: Uint8Array, reason: string): ProjectRecord {
  const stored = readStoredFacts(bytes)
  return {
    id,
    location: IN_WORKSPACE,
    name: stored.name,
    floorCount: undefined,
    preview: undefined,
    assetHashes: stored.assetHashes,
    assetListComplete: false,
    lastChangedAt: STORED_AT,
    lastUsedAt: STORED_AT,
    lastOpen: { opened: false, build: REBUILD_BUILD, reason },
  }
}

/** A record of a project in a folder that the user picked, under `id`. */
export function folderRecord(id: string, overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id,
    location: IN_FOLDER,
    name: `Folder project ${id}`,
    floorCount: 1,
    preview: undefined,
    assetHashes: [],
    assetListComplete: true,
    lastChangedAt: EARLIER_CHANGE,
    lastUsedAt: USED_AT,
    lastOpen: { opened: true, build: 'an-older-build' },
    ...overrides,
  }
}

/** The ids of the records, in their order. */
export function idsOf(records: readonly ProjectRecord[]): string[] {
  return records.map((record) => record.id)
}

/**
 * The record in the result for a listed project whose document could not be read: no facts, the
 * reason `storage-unavailable`, and the listed time as both its times.
 */
export function unreadRecordOf(id: string): ProjectRecord {
  return {
    id,
    location: IN_WORKSPACE,
    name: undefined,
    floorCount: undefined,
    preview: undefined,
    assetHashes: [],
    assetListComplete: false,
    lastChangedAt: STORED_AT,
    lastUsedAt: STORED_AT,
    lastOpen: { opened: false, build: REBUILD_BUILD, reason: 'storage-unavailable' },
  }
}

/**
 * A document of the current version with no `floors`, named `name`. It fails only the strict
 * check, and the facts of the project that it opens as cannot be built.
 */
export function documentWithoutFloors(name: string): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).name = name
  delete document.floors
  return bytesOf(document)
}

/** From now on each `read` of the store rejects with `error` for the ids of `failing`. */
export function failReadsOf(ports: TestPorts, failing: readonly string[], error: Error): void {
  const realRead = ports.workspace.read.bind(ports.workspace)
  ports.workspace.read = (id) => (failing.includes(id) ? Promise.reject(error) : realRead(id))
}

/**
 * The arguments of each warning that reports failed steps: those that hold a number, the count.
 * The warning of the store about a document that breaks the format rules holds a text and the
 * list of the faults, and no number.
 */
export function stepWarnings(calls: readonly (readonly unknown[])[]): (readonly unknown[])[] {
  return calls.filter((args) => args.some((arg) => typeof arg === 'number'))
}

/** From now on each `put` of `index` for an id that `stalls` names never answers; the others run. */
export function stallPuts(index: ProjectIndex, stalls: (id: string) => boolean): void {
  const realPut = index.put.bind(index)
  index.put = (record) => (stalls(record.id) ? new Promise<void>(() => undefined) : realPut(record))
}

export interface HeldPutOfId {
  /** Whether the put of the record has started. */
  started(): boolean
  /** Lets the held put run against the real index. */
  release(): void
  /** Makes the held put reject with `error`. */
  reject(error: Error): void
}

/** From now on the `put` of the record of `id` stays pending until the test ends it; others run. */
export function holdPutOf(index: ProjectIndex, id: string): HeldPutOfId {
  const realPut = index.put.bind(index)
  let started = false
  let end: (error?: Error) => void = () => undefined
  index.put = (record) => {
    if (record.id !== id) return realPut(record)
    started = true
    return new Promise<void>((resolve, reject) => {
      end = (error) => (error === undefined ? realPut(record).then(resolve, reject) : reject(error))
    })
  }
  return { started: () => started, release: () => end(), reject: (error) => end(error) }
}

export interface HeldReadOfId {
  /** Whether the read of the project has started. */
  started(): boolean
  /** Lets the held read run against the real store. */
  release(): void
}

/** From now on each `read` of the store for `id` stays pending until the test releases it. */
export function holdReadOf(ports: TestPorts, id: string): HeldReadOfId {
  const realRead = ports.workspace.read.bind(ports.workspace)
  let started = false
  let release: () => void = () => undefined
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  ports.workspace.read = async (readId) => {
    if (readId === id) {
      started = true
      await released
    }
    return realRead(readId)
  }
  return { started: () => started, release: () => release() }
}

/** From now on the reads of the store are counted; gives the most that were in flight at once. */
export function trackReadsInFlight(ports: TestPorts): () => number {
  const realRead = ports.workspace.read.bind(ports.workspace)
  let inFlight = 0
  let most = 0
  ports.workspace.read = async (id) => {
    inFlight += 1
    most = Math.max(most, inFlight)
    try {
      return await realRead(id)
    } finally {
      inFlight -= 1
    }
  }
  return () => most
}
