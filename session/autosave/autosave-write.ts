import type { Project } from '../../core'
import { callGuarded, callGuardedAsync } from '../guarded-call'
import type { AutosaveConfig, AutosaveStatus } from './create-autosave'
import type { TrackedWriteQueue } from './tracked-write-queue'

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
  /** True when the last write that ended failed; false once a later write succeeds. */
  lastWriteFailed: boolean
  /** True once autosave is disposed. */
  disposed: boolean
  /** True once the autosave must write no recovery snapshot and remove none. */
  leavesSnapshots: boolean
}

/** Progress with no change and no write. */
export function createWriteProgress(): WriteProgress {
  return {
    changes: 0,
    storedChanges: 0,
    runningFrom: undefined,
    lastWriteFailed: false,
    disposed: false,
    leavesSnapshots: false,
  }
}

/**
 * True when no running write started after the last change, and either a change is not stored or
 * the last write that ended failed: after a failed write something may be unsaved, also when no
 * change was made.
 */
export function needsWrite(progress: WriteProgress): boolean {
  if (progress.runningFrom === progress.changes) {
    return false
  }
  return progress.changes !== progress.storedChanges || progress.lastWriteFailed
}

/** Makes every later write of the autosave save the project and touch no recovery snapshot. */
export function leaveSnapshots(progress: WriteProgress): void {
  progress.leavesSnapshots = true
}

/** Saves the project, then gives what the save found to the report callback, guarded. */
async function saveAndReport(config: AutosaveConfig, project: Project): Promise<void> {
  const report = await config.store.save(config.projectId, project)
  const { onReport } = config
  callGuarded(() => onReport?.(report))
}

/**
 * Writes an unsaved change now, or waits for the writes that run or wait. It asks for a write only
 * when a change is unsaved or the last write failed, and no running write started after the last
 * change; a write that already waits is the one the queue gives. It rejects with the error of the
 * last write, and at once after dispose.
 */
export function flushWrites(queue: TrackedWriteQueue, progress: WriteProgress): Promise<void> {
  if (progress.disposed) {
    return Promise.reject(new Error(AUTOSAVE_DISPOSED_MESSAGE))
  }
  if (needsWrite(progress)) {
    return queue.request()
  }
  return queue.latest() ?? Promise.resolve()
}

/**
 * Writes ahead to a snapshot when snapshots are set and not left, saves, then prunes. A prune that
 * rejects goes to console.error and does not fail the write, because the project is stored by
 * then; the next write that succeeds prunes again, unless the handle leaves its snapshots.
 */
async function storeProject(
  config: AutosaveConfig,
  progress: WriteProgress,
  project: Project,
): Promise<void> {
  const snapshots = progress.leavesSnapshots ? undefined : config.snapshots
  if (snapshots === undefined) {
    await saveAndReport(config, project)
    return
  }
  // A crash during the save still finds the edit in the snapshot. The prune runs only after the
  // save resolved, so a failed save leaves the snapshot.
  await snapshots.writeSnapshot(project)
  await saveAndReport(config, project)
  await callGuardedAsync(() => snapshots.prune())
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

/**
 * Reads the project and the count of changes, then stores the project. Gives the count of changes
 * read at the start.
 */
async function startAndStore(config: AutosaveConfig, progress: WriteProgress): Promise<number> {
  const project = config.session.getProject()
  const startedFrom = progress.changes
  progress.runningFrom = startedFrom
  try {
    await storeProject(config, progress, project)
  } finally {
    progress.runningFrom = undefined
  }
  return startedFrom
}

/**
 * The write that the queue of an autosave runs. It reads the project and the count of changes when
 * it starts, before it yields, so a write that waited stores the later state. A write that fails
 * for any reason marks the last write as failed, reports error, and rejects with its own error; a
 * write that succeeds clears that mark. After dispose it saves nothing and reports nothing. A
 * callback that throws goes to console.error and never changes the outcome of the write.
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
    let startedFrom: number
    try {
      startedFrom = await startAndStore(config, progress)
    } catch (error) {
      progress.lastWriteFailed = true
      report('error')
      throw error
    }
    progress.storedChanges = startedFrom
    progress.lastWriteFailed = false
    if (progress.changes === startedFrom) {
      report('saved')
    }
  }
}
