import type { Project } from '../../core'
import type { ProjectStore, SaveReport } from '../../storage'
import type { EditorSession } from '../editor-session/editor-session'
import {
  createAutosaveWrite,
  createStatusReporter,
  createWriteProgress,
  flushWrites,
  needsWrite,
} from './autosave-write'
import { createTrackedWriteQueue } from './tracked-write-queue'

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
  /** Called each time a store save resolves, with what the save found. */
  onReport?: (report: SaveReport) => void
}

export interface Autosave {
  /** Cancels the wait and asks for a write now, also when nothing changed. Resolves when a write
   *  that started after this call has ended, and rejects with that write's error. */
  save(): Promise<void>
  /** Cancels the wait. Asks for a write only when a change is unsaved or the last write failed,
   *  no running write started after the last change, and no write waits. Resolves when the
   *  writes that run or wait have ended, and rejects with the error of the last of them. With
   *  nothing unsaved, no failed write, and no write, it resolves at once and calls no store
   *  method. It rejects after dispose. */
  flush(): Promise<void>
  /** True when a write is needed, or when a write of this autosave runs or waits in its queue,
   *  whoever asked for it. */
  hasWorkLeft(): boolean
  /** Ends the session subscription and the wait. A write that waits never starts. */
  dispose(): void
}

/**
 * Stores the project of the session a moment after each change. Every write, of the timer, of
 * `save()`, or of `flush()`, goes through one queue, so two saves never run together and the last
 * state wins.
 */
export function createAutosave(config: AutosaveConfig): Autosave {
  const delayMs = config.delayMs ?? DEFAULT_AUTOSAVE_DELAY_MS
  const report = createStatusReporter(config)
  const progress = createWriteProgress()
  const queue = createTrackedWriteQueue(createAutosaveWrite(config, progress))
  let timer: ReturnType<typeof setTimeout> | undefined

  const cancelWait = (): void => {
    clearTimeout(timer)
    timer = undefined
  }

  const writeWhenUnwritten = (): void => {
    timer = undefined
    if (needsWrite(progress)) {
      // Nobody awaits this write. A failed write has reported its status, and a write dropped
      // after dispose is silent on purpose. A callback that throws has gone to console.error.
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
    flush() {
      cancelWait()
      return flushWrites(queue, progress)
    },
    hasWorkLeft: () => needsWrite(progress) || queue.latest() !== undefined,
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
