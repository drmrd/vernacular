import type { Project } from '../../core'
import type { ProjectStore } from '../../storage'
import type { EditorSession } from '../editor-session/editor-session'
import { createWriteQueue } from '../handle/write-queue'
import { createAutosaveWrite, createWriteProgress, hasUnwrittenChange } from './autosave-write'

export type AutosaveStatus = 'idle' | 'pending' | 'saved' | 'error'

export const DEFAULT_AUTOSAVE_DELAY_MS = 500

const noop = (): void => {}

/** Writes a rolling autosave snapshot (the SnapshotStore write side). */
export interface SnapshotWriter {
  writeSnapshot(project: Project): Promise<void>
}

/** Prunes autosave snapshots on explicit save (the SnapshotStore prune side). */
export interface SnapshotPruner {
  prune(): Promise<void>
}

export interface AutosaveOptions {
  delayMs?: number
  onStatusChange?: (status: AutosaveStatus) => void
}

export interface AutosaveConfig extends AutosaveOptions {
  session: EditorSession
  store: ProjectStore
  projectId: string
  snapshots?: SnapshotWriter & SnapshotPruner
  /** Reads the dirty-tracker revision. Read when a write starts, before it yields, so onSaved
   *  reports the revision of the project actually written, never a later edit's. */
  revision?: () => number
  /** Called after a write that succeeded, with the revision read when that write started. Not
   *  called when the write fails. */
  onSaved?: (savedRevision: number) => void
}

export interface Autosave {
  /** Cancels the wait and asks for a write now, also when nothing changed. Resolves when a write
   *  that started after this call has ended, and rejects with that write's error. */
  save(): Promise<void>
  /** Ends the session subscription and the wait. A write that waits never starts. */
  dispose(): void
}

/**
 * Stores the project of the session a moment after each change. Every write, of the timer or of
 * `save()`, goes through one queue, so two saves never run together and the last state wins.
 */
export function createAutosave(config: AutosaveConfig): Autosave {
  const delayMs = config.delayMs ?? DEFAULT_AUTOSAVE_DELAY_MS
  const report = config.onStatusChange ?? noop
  const progress = createWriteProgress()
  const queue = createWriteQueue(createAutosaveWrite(config, progress))
  let timer: ReturnType<typeof setTimeout> | undefined

  const cancelWait = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const writeWhenUnwritten = (): void => {
    timer = undefined
    if (hasUnwrittenChange(progress)) {
      // Nobody awaits this write. A failed write has reported its status, a write dropped after
      // dispose is silent on purpose, and a callback that throws is left unreported here.
      queue.request().catch(noop)
    }
  }

  const unsubscribe = config.session.subscribe(() => {
    progress.changes += 1
    report('pending')
    cancelWait()
    timer = setTimeout(writeWhenUnwritten, delayMs)
  })

  return {
    save() {
      cancelWait()
      return queue.request()
    },
    dispose() {
      progress.disposed = true
      unsubscribe()
      cancelWait()
    },
  }
}

export interface CommitProjectOptions {
  store: ProjectStore
  projectId: string
  project: Project
  snapshots?: SnapshotPruner
}

/** Explicit save: writes the canonical project, then prunes autosave snapshots. */
export async function commitProject(options: CommitProjectOptions): Promise<void> {
  const { store, projectId, project, snapshots } = options
  await store.save(projectId, project)
  if (snapshots) {
    await snapshots.prune()
  }
}
