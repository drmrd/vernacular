import type { Project } from '../../core'
import type { ProjectStore } from '../../storage'
import type { EditorSession } from '../session/editor-session'

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
  /** Reads the dirty-tracker revision. Captured synchronously at persist time
   *  (before any await) so onSaved reports the revision of the project actually
   *  written, never a later edit's. */
  revision?: () => number
  /** Called after a successful persist with the revision captured at persist
   *  start. Not called when the persist fails. */
  onSaved?: (savedRevision: number) => void
}

export interface Autosave {
  dispose(): void
}

export function createAutosave(config: AutosaveConfig): Autosave {
  const { session, store, projectId, snapshots } = config
  const delayMs = config.delayMs ?? DEFAULT_AUTOSAVE_DELAY_MS
  const report = config.onStatusChange ?? noop
  let timer: ReturnType<typeof setTimeout> | undefined

  // Resolve the persistence strategy once: with snapshots configured we write
  // ahead, otherwise we save canonically. persist() then closes over a single
  // write function with no per-call branching.
  const write: (project: Project) => Promise<void> = snapshots
    ? async (project) => {
        // Write ahead to a snapshot first so a crash mid-save still recovers the
        // edit, then save canonically, then prune. prune() runs only after the
        // canonical save resolves, so a failed save leaves the snapshot intact.
        await snapshots.writeSnapshot(project)
        await store.save(projectId, project)
        await snapshots.prune()
      }
    : (project) => store.save(projectId, project)

  const persist = (): void => {
    // getProject() is a live reference; reading it when the debounce fires saves
    // the latest coalesced edit. ProjectStore.save clones synchronously, so a
    // dispatch arriving mid-save does not corrupt the written snapshot.
    //
    // Capture the revision synchronously here, before the async write begins, so
    // a dispatch arriving mid-write advances the live revision while
    // savedRevision stays fixed to the project actually persisted.
    const project = session.getProject()
    const savedRevision = config.revision?.()
    void write(project)
      .then(() => {
        report('saved')
        if (savedRevision !== undefined) {
          config.onSaved?.(savedRevision)
        }
      })
      .catch(() => report('error'))
  }

  const unsubscribe = session.subscribe(() => {
    report('pending')
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    timer = setTimeout(persist, delayMs)
  })

  return {
    dispose() {
      unsubscribe()
      if (timer !== undefined) {
        clearTimeout(timer)
      }
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
