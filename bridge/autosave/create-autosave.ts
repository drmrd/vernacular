import type { ProjectStore } from '../../storage'
import type { EditorSession } from '../session/editor-session'

export type AutosaveStatus = 'idle' | 'pending' | 'saved'

export const DEFAULT_AUTOSAVE_DELAY_MS = 500

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
  const report = options.onStatusChange ?? (() => {})
  let timer: ReturnType<typeof setTimeout> | undefined

  const persist = (): void => {
    void store.save(projectId, session.getProject()).then(() => report('saved'))
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
