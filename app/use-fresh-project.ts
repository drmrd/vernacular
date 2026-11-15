import { useState, type Dispatch, type SetStateAction } from 'react'
import { createEditorSession, type EditorSession } from '../bridge'
import {
  InMemoryAssetCache,
  InMemoryProjectStore,
  newProjectId,
  type ProjectStorage,
  type ProjectStore,
} from '../storage'
import { createInitialProject } from './create-initial-project'

export interface FreshProjectContext {
  store: ProjectStore | null
  setResolved: Dispatch<SetStateAction<ProjectStorage | null>>
  setSession: (session: EditorSession) => void
  setError: (error: Error | null) => void
}

export interface FreshProject {
  /** The id of the project started after a failed load; null until one is started. */
  freshProjectId: string | null
  /** Leave the unreadable stored project alone and work in a fresh empty one under its own id. */
  startFreshProject: () => void
}

// A project started after a failed load gets an id no stored project has, so its
// autosave and snapshots never write under the id that failed (ADR-0183).
export function useFreshProject(context: FreshProjectContext): FreshProject {
  const { store, setResolved, setSession, setError } = context
  const [freshProjectId, setFreshProjectId] = useState<string | null>(null)

  const startFreshProject = () => {
    // A failed storage resolution leaves no store at all; an in-memory pair keeps the
    // fresh project workable.
    const fallback = freshStorage()
    void storedProjectIds(store ?? fallback.store).then((ids) => {
      setResolved((current) => current ?? fallback)
      setFreshProjectId(newProjectId(ids))
      setSession(createEditorSession(createInitialProject()))
      setError(null)
    })
  }
  return { freshProjectId, startFreshProject }
}

// A listing that fails still allows a fresh project: a random id cannot name the failed one.
function storedProjectIds(store: ProjectStore): Promise<string[]> {
  return store
    .list()
    .then((summaries) => summaries.map((summary) => summary.id))
    .catch(() => [])
}

function freshStorage(): ProjectStorage {
  return { store: new InMemoryProjectStore(), assets: new InMemoryAssetCache() }
}
