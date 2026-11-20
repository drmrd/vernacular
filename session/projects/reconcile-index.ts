import type { ProjectRecord } from '../../storage'
import type { SessionPorts } from '../ports'
import { rebuildRecord, type ListedProject } from './rebuild-record'

/** The run of each ports object that has not ended yet, so that calls that overlap share it. */
const runs = new WeakMap<SessionPorts, Promise<ProjectRecord[]>>()

/** Orders records by id, by code unit, as the index gives them. */
function compareIds(first: ProjectRecord, second: ProjectRecord): number {
  if (first.id === second.id) {
    return 0
  }
  return first.id < second.id ? -1 : 1
}

/** Every record of the index; none when the index cannot be read, so every project is rebuilt. */
async function indexRecords(ports: SessionPorts): Promise<readonly ProjectRecord[]> {
  try {
    return await ports.index.all()
  } catch {
    return []
  }
}

/** The projects of the store; undefined when they cannot be listed. */
async function storeListing(ports: SessionPorts): Promise<readonly ListedProject[] | undefined> {
  try {
    return await ports.workspace.list()
  } catch {
    return undefined
  }
}

/** Removes the record of a project that is gone. */
async function removeRecord(ports: SessionPorts, id: string): Promise<void> {
  try {
    await ports.index.remove(id)
  } catch {
    // The record stays in the index, and the next call removes it again.
  }
}

/** Puts a rebuilt record. */
async function putRecord(ports: SessionPorts, record: ProjectRecord): Promise<void> {
  try {
    await ports.index.put(record)
  } catch {
    // The index stays behind the store, and the next call rebuilds the record again.
  }
}

/**
 * Removes the workspace records whose project the listing lacks, and returns the folder records
 * among them, which stay. A workspace record belongs to a project that is gone, since a record is
 * written only after its project was stored. A folder record names a project in a folder, which
 * the listing of the store does not cover, so it is kept as it is.
 */
async function dropGoneRecords(
  ports: SessionPorts,
  unlisted: readonly ProjectRecord[],
): Promise<ProjectRecord[]> {
  const gone = unlisted.filter((record) => record.location.kind === 'workspace')
  await Promise.all(gone.map((record) => removeRecord(ports, record.id)))
  return unlisted.filter((record) => record.location.kind !== 'workspace')
}

/**
 * The record of a listed project: the workspace record when it agrees with the store, so its
 * document is not read, else a record rebuilt from the stored document.
 */
async function recordOfListed(
  ports: SessionPorts,
  listed: ListedProject,
  previous: ProjectRecord | undefined,
): Promise<ProjectRecord> {
  if (previous?.location.kind === 'workspace' && previous.lastChangedAt === listed.lastChangedAt) {
    return previous
  }
  const rebuilt = await rebuildRecord(ports, listed, previous)
  if (rebuilt.putInIndex) {
    await putRecord(ports, rebuilt.record)
  }
  return rebuilt.record
}

/** Reads the index first, then lists the store, then drops, keeps, or rebuilds each record. */
async function reconcile(ports: SessionPorts): Promise<ProjectRecord[]> {
  const records = await indexRecords(ports)
  const listing = await storeListing(ports)
  if (listing === undefined) {
    return [...records].sort(compareIds)
  }
  const listedIds = new Set(listing.map((listed) => listed.id))
  const previousById = new Map(records.map((record) => [record.id, record]))
  const kept = await dropGoneRecords(
    ports,
    records.filter((record) => !listedIds.has(record.id)),
  )
  // One project after the other: a first start can rebuild many projects, and doing them all at
  // once holds every decoded document in memory at the same time. A start waits for this function.
  const settled: ProjectRecord[] = []
  for (const listed of listing) {
    settled.push(await recordOfListed(ports, listed, previousById.get(listed.id)))
  }
  return [...kept, ...settled].sort(compareIds)
}

/** Starts the run of a ports object, and forgets it when it ends. */
function startRun(ports: SessionPorts): Promise<ProjectRecord[]> {
  const run = reconcile(ports).finally(() => runs.delete(ports))
  runs.set(ports, run)
  return run
}

/**
 * Brings the index in line with the stored projects and gives every record. Never rejects.
 * Calls that overlap share one run, and each gets its own list.
 */
export function reconcileIndex(ports: SessionPorts): Promise<ProjectRecord[]> {
  const running = runs.get(ports)
  const run = running ?? startRun(ports)
  return run.then((records) => [...records])
}
