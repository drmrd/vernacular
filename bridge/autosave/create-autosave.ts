import type { Project } from '../../core'
import type { ProjectStore } from '../../storage'
import type { EditorSession } from '../session/editor-session'

export type AutosaveStatus = 'idle' | 'pending' | 'saved' | 'error'

export const DEFAULT_AUTOSAVE_DELAY_MS = 500

const noop = (): void => {}

export interface AutosaveOptions {
  delayMs?: number
  onStatusChange?: (status: AutosaveStatus) => void
}

export interface AutosaveConfig extends AutosaveOptions {
  session: EditorSession
  store: ProjectStore
  projectId: string
  snapshots?: { writeSnapshot(project: Project): Promise<void> }
}

export interface Autosave {
  dispose(): void
}

export function createAutosave(config: AutosaveConfig): Autosave {
  const { session, store, projectId } = config
  const delayMs = config.delayMs ?? DEFAULT_AUTOSAVE_DELAY_MS
  const report = config.onStatusChange ?? noop
  let timer: ReturnType<typeof setTimeout> | undefined

  const persist = (): void => {
    // getProject() is a live reference; reading it when the debounce fires saves
    // the latest coalesced edit. ProjectStore.save clones synchronously, so a
    // dispatch arriving mid-save does not corrupt the written snapshot.
    const project = session.getProject()
    const write = config.snapshots
      ? config.snapshots.writeSnapshot(project)
      : store.save(projectId, project)
    void write.then(() => report('saved')).catch(() => report('error'))
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

/** Explicit save: writes the canonical project, then prunes autosave snapshots. */
export async function commitProject(
  store: ProjectStore,
  projectId: string,
  project: Project,
  snapshots?: { prune(): Promise<void> },
): Promise<void> {
  await store.save(projectId, project)
  if (snapshots) {
    await snapshots.prune()
  }
}
