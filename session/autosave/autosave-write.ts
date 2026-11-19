import type { Project } from '../../core'
import { callGuarded } from '../guarded-call'
import { createWriteQueue, type WriteQueue } from '../handle/write-queue'
import type { AutosaveConfig, AutosaveStatus } from './create-autosave'

const noop = (): void => {}

/** The message of the error that a write that would start after dispose gives instead of saving. */
const AUTOSAVE_DISPOSED_MESSAGE = 'Autosave has stopped, so nothing was saved.'

/** What autosave knows of the changes of its session and of its writes. */
export interface WriteProgress {
  /** How many changes the session has made since autosave started. */
  changes: number
  /** The count of changes when the last write that succeeded started. */
  storedChanges: number
  /** The count of changes when the running write started; undefined when none runs. */
  runningFrom: number | undefined
  /** True once autosave is disposed. */
  disposed: boolean
}

/** Progress with no change and no write. */
export function createWriteProgress(): WriteProgress {
  return { changes: 0, storedChanges: 0, runningFrom: undefined, disposed: false }
}

/** True when a change is not stored and no running write started after it. */
export function hasUnwrittenChange(progress: WriteProgress): boolean {
  if (progress.runningFrom === progress.changes) {
    return false
  }
  return progress.changes !== progress.storedChanges
}

/** Saves the project, then gives what the save found to the report callback, guarded. */
async function saveAndReport(config: AutosaveConfig, project: Project): Promise<void> {
  const report = await config.store.save(config.projectId, project)
  const { onReport } = config
  callGuarded(() => onReport?.(report))
}

/** The write queue of an autosave, which also knows the promise of the last write asked for. */
export interface TrackedWriteQueue extends WriteQueue {
  /** The promise of the last write asked for, while it has not settled; otherwise undefined. */
  latest(): Promise<void> | undefined
}

/** A write queue around `write` that remembers the last write asked for until it settles. */
export function createTrackedWriteQueue(write: () => Promise<void>): TrackedWriteQueue {
  const queue = createWriteQueue(write)
  let latest: Promise<void> | undefined
  return {
    request() {
      const requested = queue.request()
      latest = requested
      const forget = (): void => {
        if (latest === requested) {
          latest = undefined
        }
      }
      requested.then(forget, forget)
      return requested
    },
    latest: () => latest,
  }
}

/**
 * Writes an unsaved change now, or waits for the writes that run or wait. It asks for a write only
 * when a change is unsaved and no running write started after it; a write that already waits is
 * the one the queue gives. It rejects with the error of the last write, and at once after dispose.
 */
export function flushWrites(queue: TrackedWriteQueue, progress: WriteProgress): Promise<void> {
  if (progress.disposed) {
    return Promise.reject(new Error(AUTOSAVE_DISPOSED_MESSAGE))
  }
  if (hasUnwrittenChange(progress)) {
    return queue.request()
  }
  return queue.latest() ?? Promise.resolve()
}

/** Writes ahead to a snapshot when snapshots are set, saves, then prunes. */
async function storeProject(config: AutosaveConfig, project: Project): Promise<void> {
  const { snapshots } = config
  if (snapshots === undefined) {
    await saveAndReport(config, project)
    return
  }
  // A crash during the save still finds the edit in the snapshot. The prune runs only after the
  // save resolved, so a failed save leaves the snapshot.
  await snapshots.writeSnapshot(project)
  await saveAndReport(config, project)
  await snapshots.prune()
}

/**
 * The status callback of the config, guarded: a throw goes to console.error and changes nothing
 * for the edit or the write that reported.
 */
export function createStatusReporter(config: AutosaveConfig): (status: AutosaveStatus) => void {
  const report = config.onStatusChange ?? noop
  return (status) => {
    callGuarded(() => report(status))
  }
}

interface StartedWrite {
  startedFrom: number
  revision: number | undefined
}

/** Reads the project, the revision, and the count of changes, then stores the project. */
async function startAndStore(
  config: AutosaveConfig,
  progress: WriteProgress,
): Promise<StartedWrite> {
  const project = config.session.getProject()
  const revision = config.revision?.()
  const startedFrom = progress.changes
  progress.runningFrom = startedFrom
  try {
    await storeProject(config, project)
  } finally {
    progress.runningFrom = undefined
  }
  return { startedFrom, revision }
}

/**
 * The write that the queue of an autosave runs. It reads the project, the revision, and the count
 * of changes when it starts, before it yields, so a write that waited stores the later state and
 * reports the revision of its own start. A write that fails for any reason reports error and
 * rejects with its own error. After dispose it saves nothing and reports nothing. A callback that
 * throws goes to console.error and never changes the outcome of the write.
 */
export function createAutosaveWrite(
  config: AutosaveConfig,
  progress: WriteProgress,
): () => Promise<void> {
  const report = createStatusReporter(config)
  return async () => {
    if (progress.disposed) {
      throw new Error(AUTOSAVE_DISPOSED_MESSAGE)
    }
    let started: StartedWrite
    try {
      started = await startAndStore(config, progress)
    } catch (error) {
      report('error')
      throw error
    }
    const { startedFrom, revision } = started
    progress.storedChanges = startedFrom
    if (progress.changes === startedFrom) {
      report('saved')
    }
    if (revision !== undefined) {
      const { onSaved } = config
      callGuarded(() => onSaved?.(revision))
    }
  }
}
