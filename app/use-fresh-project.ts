import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
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
  /** The failure the fresh project answers; a lookup that resolves after it has gone is dropped. */
  error: Error | null
}

export interface FreshProject {
  /** The id of the project started after a failed load; null until one is started. */
  freshProjectId: string | null
  /** True once a fresh project starts on a store that resolved; false on the in-memory fallback. */
  freshProjectDurable: boolean
  /** Leave the unreadable stored project alone and work in a fresh empty one under its own id. */
  startFreshProject: () => void
}

// A project started after a failed load gets an id no stored project has, so its
// autosave and snapshots never write under the id that failed (ADR-0183).
export function useFreshProject(context: FreshProjectContext): FreshProject {
  const { store, setResolved, setSession, setError, error } = context
  const [freshProjectId, setFreshProjectId] = useState<string | null>(null)
  const [freshProjectDurable, setFreshProjectDurable] = useState(false)

  const mounted = useRef(true)
  const currentError = useRef(error)
  const lookupPendingFor = useRef<Error | null>(null)
  useEffect(() => {
    currentError.current = error
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const startFreshProject = () => {
    // A second click while the first id lookup is pending would set a second id.
    if (error === null || lookupPendingFor.current === error) return
    const answeredError = error
    lookupPendingFor.current = answeredError
    // A failed storage resolution leaves no store at all; an in-memory pair keeps the
    // fresh project workable.
    const fallback = freshStorage()
    void storedProjectIds(store ?? fallback.store).then((ids) => {
      if (lookupPendingFor.current === answeredError) lookupPendingFor.current = null
      // A retry that ran meanwhile (and loaded, or failed anew) owns the outcome now.
      // A store rejecting two loads with one cached Error makes an older lookup apply; one valid new id still results, so this is accepted.
      if (!mounted.current || currentError.current !== answeredError) return
      setResolved((current) => current ?? fallback)
      setFreshProjectId(newProjectId(ids))
      setFreshProjectDurable(store !== null)
      setSession(createEditorSession(createInitialProject()))
      setError(null)
    })
  }
  return { freshProjectId, freshProjectDurable, startFreshProject }
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
