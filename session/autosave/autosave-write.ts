import type { Project } from '../../core'
import type { AutosaveConfig } from './create-autosave'

const noop = (): void => {}

/** The message of the error that a write asked for after dispose gives instead of saving. */
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

/** Writes ahead to a snapshot when snapshots are set, saves, then prunes. */
async function storeProject(config: AutosaveConfig, project: Project): Promise<void> {
  const { store, projectId, snapshots } = config
  if (snapshots === undefined) {
    await store.save(projectId, project)
    return
  }
  // A crash during the save still finds the edit in the snapshot. The prune runs only after the
  // save resolved, so a failed save leaves the snapshot.
  await snapshots.writeSnapshot(project)
  await store.save(projectId, project)
  await snapshots.prune()
}

/**
 * The write that the queue of an autosave runs. It reads the project, the revision, and the count
 * of changes when it starts, before it yields, so a write that waited stores the later state and
 * reports the revision of its own start. After dispose it saves nothing and reports nothing.
 */
export function createAutosaveWrite(
  config: AutosaveConfig,
  progress: WriteProgress,
): () => Promise<void> {
  const report = config.onStatusChange ?? noop
  return async () => {
    if (progress.disposed) {
      throw new Error(AUTOSAVE_DISPOSED_MESSAGE)
    }
    const project = config.session.getProject()
    const revision = config.revision?.()
    const startedFrom = progress.changes
    progress.runningFrom = startedFrom
    try {
      await storeProject(config, project)
    } catch (error) {
      report('error')
      throw error
    } finally {
      progress.runningFrom = undefined
    }
    progress.storedChanges = startedFrom
    if (progress.changes === startedFrom) {
      report('saved')
    }
    if (revision !== undefined) {
      config.onSaved?.(revision)
    }
  }
}
