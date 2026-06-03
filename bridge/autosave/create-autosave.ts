import type { ProjectStore } from '../../storage'
import type { EditorSession } from '../session/editor-session'

export type AutosaveStatus = 'idle' | 'pending' | 'saved' | 'error'

export const DEFAULT_AUTOSAVE_DELAY_MS = 500

const noop = (): void => {}

export interface AutosaveOptions {
  delayMs?: number
  onStatusChange?: (status: AutosaveStatus) => void
}

export interface Autosave {
  dispose(): void
}

export function createAutosave(
  session: EditorSession,
  store: ProjectStore,
  projectId: string,
  options: AutosaveOptions = {},
): Autosave {
  const delayMs = options.delayMs ?? DEFAULT_AUTOSAVE_DELAY_MS
  const report = options.onStatusChange ?? noop
  let timer: ReturnType<typeof setTimeout> | undefined

  const persist = (): void => {
    // getProject() is a live reference; reading it when the debounce fires saves
    // the latest coalesced edit. ProjectStore.save clones synchronously, so a
    // dispatch arriving mid-save does not corrupt the written snapshot.
    void store
      .save(projectId, session.getProject())
      .then(() => report('saved'))
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
