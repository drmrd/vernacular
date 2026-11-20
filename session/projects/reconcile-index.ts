import type { ProjectRecord } from '../../storage'
import type { SessionPorts } from '../ports'
import {
  rebuildRecord,
  type FailedSteps,
  type ListedProject,
  type RebuildRun,
} from './rebuild-record'

/** The run of each ports object that has not ended yet, so that calls that overlap share it. */
const runs = new WeakMap<SessionPorts, Promise<ProjectRecord[]>>()

/** Orders records by id, by code unit, as the index gives them. */
function compareIds(first: ProjectRecord, second: ProjectRecord): number {
  if (first.id === second.id) {
    return 0
  }
  return first.id < second.id ? -1 : 1
}

/** What a warning of a run says first, before the label of the count of its failed steps. */
const FAILED_STEPS_WARNING =
  'The project index could not be brought fully in line with the stored projects; ' +
  'the next rebuild tries again. Failed steps:'

/** The label of the first error of a run in its warning. */
const FIRST_ERROR_LABEL = 'First error:'

/**
 * What one run works with: the ports, the failed steps that it notes as it goes, and the puts that
 * it started and awaits at its end.
 */
interface ReconcileRun extends RebuildRun {
  readonly ports: SessionPorts
  readonly startedPuts: Promise<void>[]
}

/** The failed steps of one run: their count, the first error, and the one warning about them. */
interface FailedStepsOfRun extends FailedSteps {
  /** Warns once with the count and the first error; does nothing when no step failed. */
  warnIfAny(): void
}

/** The failed steps of a new run: none yet. */
function createFailedSteps(): FailedStepsOfRun {
  let count = 0
  let firstError: unknown
  return {
    note(error) {
      if (count === 0) {
        firstError = error
      }
      count += 1
    },
    warnIfAny() {
      if (count === 0) {
        return
      }
      try {
        console.warn(FAILED_STEPS_WARNING, count, FIRST_ERROR_LABEL, firstError)
      } catch {
        // The warning only reports; a console that cannot take it must not change the result.
      }
    },
  }
}

/** Every record of the index; none when the index cannot be read, so every project is rebuilt. */
async function indexRecords(run: ReconcileRun): Promise<readonly ProjectRecord[]> {
  try {
    return await run.ports.index.all()
  } catch (error) {
    run.failed.note(error)
    return []
  }
}

/** The projects of the store; undefined when they cannot be listed. */
async function storeListing(run: ReconcileRun): Promise<readonly ListedProject[] | undefined> {
  try {
    return await run.ports.workspace.list()
  } catch (error) {
    run.failed.note(error)
    return undefined
  }
}

/** Removes the record of a project that is gone. A failure leaves it for the next call. */
async function removeRecord(run: ReconcileRun, id: string): Promise<void> {
  try {
    await run.ports.index.remove(id)
  } catch (error) {
    run.failed.note(error)
  }
}

/** Puts a rebuilt record. A failure leaves the index behind, and the next call rebuilds it. */
async function putRecord(run: ReconcileRun, record: ProjectRecord): Promise<void> {
  try {
    await run.ports.index.put(record)
  } catch (error) {
    run.failed.note(error)
  }
}

/**
 * Removes the workspace records whose project the listing lacks, and returns the folder records
 * among them, which stay. A workspace record belongs to a project that is gone, since a record is
 * written only after its project was stored. A folder record names a project in a folder, which
 * the listing of the store does not cover, so it is kept as it is.
 */
async function dropGoneRecords(
  run: ReconcileRun,
  unlisted: readonly ProjectRecord[],
): Promise<ProjectRecord[]> {
  const gone = unlisted.filter((record) => record.location.kind === 'workspace')
  await Promise.all(gone.map((record) => removeRecord(run, record.id)))
  return unlisted.filter((record) => record.location.kind !== 'workspace')
}

/**
 * The record of a listed project: the workspace record when it agrees with the store, so its
 * document is not read, else a record rebuilt from the stored document.
 */
async function recordOfListed(
  run: ReconcileRun,
  listed: ListedProject,
  previous: ProjectRecord | undefined,
): Promise<ProjectRecord> {
  if (previous?.location.kind === 'workspace' && previous.lastChangedAt === listed.lastChangedAt) {
    return previous
  }
  const rebuilt = await rebuildRecord(run, listed, previous)
  if (rebuilt.putInIndex) {
    // Started, not awaited here: over an index whose writes do not answer, awaiting each put before
    // the next read would make a run last one write limit for each project.
    run.startedPuts.push(putRecord(run, rebuilt.record))
  }
  return rebuilt.record
}

/** Reads the index first, then lists the store, then drops, keeps, or rebuilds each record. */
async function reconcileSteps(run: ReconcileRun): Promise<ProjectRecord[]> {
  const records = await indexRecords(run)
  const listing = await storeListing(run)
  if (listing === undefined) {
    return [...records].sort(compareIds)
  }
  const listedIds = new Set(listing.map((listed) => listed.id))
  const previousById = new Map(records.map((record) => [record.id, record]))
  const kept = await dropGoneRecords(
    run,
    records.filter((record) => !listedIds.has(record.id)),
  )
  // The reads run one after the other: a first start can rebuild many projects, and reading them
  // all at once holds every decoded document in memory at the same time. Their puts overlap.
  const listedRecords: ProjectRecord[] = []
  for (const listed of listing) {
    listedRecords.push(await recordOfListed(run, listed, previousById.get(listed.id)))
  }
  return [...kept, ...listedRecords].sort(compareIds)
}

/**
 * One run, with one warning at its end about every step that failed, so a tab with a broken index
 * or store reports it once and not once for each project.
 */
async function reconcile(ports: SessionPorts): Promise<ProjectRecord[]> {
  const failed = createFailedSteps()
  const startedPuts: Promise<void>[] = []
  const records = await reconcileSteps({ ports, failed, startedPuts })
  // A guarded put never rejects, so this waits for every put and the warning counts each failure.
  await Promise.all(startedPuts)
  failed.warnIfAny()
  return records
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
