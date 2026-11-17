import { useEffect, useMemo, useState } from 'react'
import { createEditorSession, loadOrCreateProject, type EditorSession } from '../bridge'
import {
  InMemoryAssetCache,
  type AssetCache,
  type ProjectStorage,
  type ProjectStore,
} from '../storage'
import type { AppProps } from './app'
import { createInitialProject } from './create-initial-project'
import { resolveProjectStorage } from './resolve-project-store'
import { useActiveProjectId } from './use-active-project-id'
import { useFreshProject } from './use-fresh-project'
import { useRememberSavedProject } from './use-remember-saved-project'

// Resolve the durable {store, assets} pair to boot against. An injected
// store-only resolver (tests) pairs its store with an in-memory asset cache; the
// default resolves the real pair, so the OPFS runtime gets a directory-backed
// asset cache that persists underlay rasters beside vernacular.json (ADR-0042).
async function resolveBootStorage(
  resolveStore?: () => Promise<ProjectStore>,
): Promise<ProjectStorage> {
  if (resolveStore) {
    return { store: await resolveStore(), assets: new InMemoryAssetCache() }
  }
  return resolveProjectStorage()
}

export interface ProjectBoot {
  /** The id of the open project; null until the remembered id has been read. */
  projectId: string | null
  store: ProjectStore | null
  assets: AssetCache | null
  session: EditorSession | null
  setSession: (session: EditorSession) => void
  error: Error | null
  /** Re-run the failed boot from the top (a transient I/O fault deserves a second go). */
  retryBoot: () => void
  /** Leave the unreadable stored project alone and work in a fresh empty one. */
  startFreshProject: () => void
  /** Report a successful save, so a project started after a failed load is remembered. */
  rememberSavedProject: () => void
}

export type ProjectBootInputs = Pick<
  AppProps,
  'store' | 'assets' | 'resolveStore' | 'projectId' | 'activeProjectIds'
>

// Boots the project in two steps: resolve the durable {store, assets} pair (skipped
// for an injected store, which pairs with the injected asset cache or a fresh
// in-memory one), then load or create the project. Both steps report through one
// error channel and are guarded against writes after unmount. Each stands down once
// it holds its own result, so Retry (which just clears the error) re-runs only the
// step that failed rather than swapping a resolved store under a live session.
export function useProjectBoot(inputs: ProjectBootInputs): ProjectBoot {
  const { store: providedStore, assets: providedAssets, resolveStore } = inputs
  const activeProjectId = useActiveProjectId(inputs.projectId, inputs.activeProjectIds)
  const [resolved, setResolved] = useState<ProjectStorage | null>(null)
  const [session, setSession] = useState<EditorSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const fallbackAssets = useMemo(() => new InMemoryAssetCache(), [])
  const store = providedStore ?? resolved?.store ?? null
  const assets = providedAssets ?? resolved?.assets ?? (providedStore ? fallbackAssets : null)
  const { freshProjectId, freshProjectDurable, startFreshProject } = useFreshProject({
    store,
    setResolved,
    setSession,
    setError,
    error,
  })
  const projectId = freshProjectId ?? activeProjectId
  const rememberSavedProject = useRememberSavedProject({
    projectId,
    activeProjectId,
    durable: freshProjectDurable,
    activeProjectIds: inputs.activeProjectIds,
  })

  useBootStorage({ providedStore, resolveStore, resolved, error, setResolved, setError })

  useSessionLoad({ store, projectId, session, error, setSession, setError })

  const retryBoot = () => setError(null)
  const loaded = { projectId, store, assets, session, setSession, error }
  return { ...loaded, retryBoot, startFreshProject, rememberSavedProject }
}

interface BootStorageContext {
  providedStore: ProjectStore | undefined
  resolveStore: (() => Promise<ProjectStore>) | undefined
  resolved: ProjectStorage | null
  error: Error | null
  setResolved: (storage: ProjectStorage) => void
  setError: (error: Error) => void
}

// The first boot step: resolve the durable pair unless a store was injected, once.
function useBootStorage(context: BootStorageContext): void {
  const { providedStore, resolveStore, resolved, error, setResolved, setError } = context
  useEffect(() => {
    if (providedStore || resolved !== null || error !== null) return
    let cancelled = false
    void resolveBootStorage(resolveStore)
      .then((it) => !cancelled && setResolved(it))
      .catch((cause: unknown) => !cancelled && setError(asError(cause)))
    return () => {
      cancelled = true
    }
  }, [providedStore, resolveStore, resolved, error, setResolved, setError])
}

interface SessionLoadContext {
  store: ProjectStore | null
  projectId: string | null
  session: EditorSession | null
  error: Error | null
  setSession: (session: EditorSession) => void
  setError: (error: Error) => void
}

// The second boot step: load or create the project once the store and id are known.
function useSessionLoad(context: SessionLoadContext): void {
  const { store, projectId, session, error, setSession, setError } = context
  useEffect(() => {
    if (store === null || projectId === null || session !== null || error !== null) return
    let cancelled = false
    void loadOrCreateProject(store, projectId, createInitialProject)
      .then((project) => !cancelled && setSession(createEditorSession(project)))
      .catch((cause: unknown) => !cancelled && setError(asError(cause)))
    return () => {
      cancelled = true
    }
  }, [store, projectId, session, error, setSession, setError])
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('Failed to boot the project')
}
