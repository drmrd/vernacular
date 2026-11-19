import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentHandle, OpenRequest, SessionPorts, SwitchFailure } from '../session'
import {
  BrowserFolderAccess,
  InMemoryAssetCache,
  InMemoryProjectStore,
  WebLocksProjectLockPort,
  newProjectId,
  type AssetCache,
} from '../storage'
import type { AppProps, BuiltSessionPorts } from './app'
import { createInitialProject } from './create-initial-project'
import { resolveProjectStorage } from './resolve-project-store'
import { useActiveProjectId } from './use-active-project-id'
import { useOpenProject, type RunFlow } from './use-open-project'
import { useRememberSavedProject } from './use-remember-saved-project'

export interface ProjectBoot {
  /** The open project. Null while the start runs and after a start that failed. */
  handle: DocumentHandle | null
  /** Why no project is open: the ports did not resolve, or the open failed. */
  failure: SwitchFailure | null
  runFlow: RunFlow
  /** The pool of the user's library; null until the ports are known. */
  libraryAssets: AssetCache | null
  /** Builds the ports again when they did not resolve; otherwise repeats the failed start. */
  retryBoot: () => void
  /** Leaves the project that failed alone and starts a new one under a new id. */
  startFreshProject: () => void
  /** Reports a save, so that a reload opens the project that was saved. */
  rememberSavedProject: (handle: DocumentHandle) => void
}

export type ProjectBootInputs = Pick<
  AppProps,
  'ports' | 'resolvePorts' | 'libraryAssets' | 'projectId' | 'activeProjectIds'
>

/** The ports over the durable storage of this browser, with the pool of the library. */
async function buildDefaultPorts(): Promise<BuiltSessionPorts> {
  const { store, assets } = await resolveProjectStorage()
  const ports: SessionPorts = {
    workspace: store,
    locks: new WebLocksProjectLockPort(),
    folders: new BrowserFolderAccess(undefined, { shared: assets }),
    now: () => new Date(),
  }
  return { ports, libraryAssets: assets }
}

/** Ports that keep every project in memory, for a project started after the storage failed. */
function buildTemporaryPorts(): BuiltSessionPorts {
  const assets = new InMemoryAssetCache()
  const ports: SessionPorts = {
    workspace: new InMemoryProjectStore(),
    locks: new WebLocksProjectLockPort(),
    folders: new BrowserFolderAccess(undefined, { shared: assets }),
    now: () => new Date(),
  }
  return { ports, libraryAssets: assets }
}

function startRequest(id: string): OpenRequest {
  return { id, location: { kind: 'workspace' }, create: createInitialProject }
}

function builderFailure(error: unknown): SwitchFailure {
  const message = error instanceof Error ? error.message : String(error)
  return { kind: 'storage-unavailable', message }
}

interface BootPorts {
  built: BuiltSessionPorts | null
  /** Why the ports did not resolve; null while they resolve and after they did. */
  failure: SwitchFailure | null
  /** Builds the ports again after they did not resolve. */
  rebuild: () => void
  /** Puts ports in memory in place of the ports that did not resolve. */
  fallBackToMemory: () => void
}

// Builds the ports once when none are injected. A builder that rejects gives a failure that the
// boot shows itself, since the owner has no ports then. The ports are built again only by a Retry
// after such a failure: each attempt starts one build, also when the effect runs twice.
function useBootPorts(inputs: ProjectBootInputs): BootPorts {
  const { ports: provided, resolvePorts } = inputs
  const [built, setBuilt] = useState<BuiltSessionPorts | null>(null)
  const [failure, setFailure] = useState<SwitchFailure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const startedAttempt = useRef<number | null>(null)
  useEffect(() => {
    if (provided !== undefined || startedAttempt.current === attempt) return
    startedAttempt.current = attempt
    const build = resolvePorts ?? buildDefaultPorts
    void Promise.resolve()
      .then(build)
      .then(setBuilt, (error: unknown) => setFailure(builderFailure(error)))
  }, [provided, resolvePorts, attempt])
  const rebuild = () => {
    setFailure(null)
    setAttempt((previous) => previous + 1)
  }
  const fallBackToMemory = () => {
    setFailure(null)
    setBuilt(buildTemporaryPorts())
  }
  return { built, failure, rebuild, fallBackToMemory }
}

// The pool of the library: the injected one, the built one, or one in memory under injected ports.
function useLibraryAssets(inputs: ProjectBootInputs, built: BuiltSessionPorts | null) {
  const fallback = useMemo(() => new InMemoryAssetCache(), [])
  const injected = inputs.ports === undefined ? null : fallback
  return inputs.libraryAssets ?? built?.libraryAssets ?? injected
}

// Composes the start: the ports, the start request (the remembered id, or a new project after a
// failure), the one owner of the open project, and the remembered id. It holds no handle itself.
export function useProjectBoot(inputs: ProjectBootInputs): ProjectBoot {
  const bootPorts = useBootPorts(inputs)
  const ports = inputs.ports ?? bootPorts.built?.ports ?? null
  const startId = useActiveProjectId(inputs.projectId, inputs.activeProjectIds)
  const remembered = useMemo(() => (startId === null ? null : startRequest(startId)), [startId])
  const [freshRequest, setFreshRequest] = useState<OpenRequest | null>(null)
  const owner = useOpenProject(ports, freshRequest ?? remembered)
  const failure = bootPorts.failure ?? owner.failure
  const answered = useRef<SwitchFailure | null>(null)
  const startFreshProject = () => {
    // A second call for the same failure, before the new project opened or failed, does nothing.
    if (failure === null || answered.current === failure) return
    answered.current = failure
    if (bootPorts.failure !== null) bootPorts.fallBackToMemory()
    setFreshRequest(startRequest(newProjectId([])))
  }
  const retryBoot = () => (bootPorts.failure === null ? owner.retry() : bootPorts.rebuild())
  const rememberSavedProject = useRememberSavedProject({
    startId,
    activeProjectIds: inputs.activeProjectIds,
  })
  const libraryAssets = useLibraryAssets(inputs, bootPorts.built)
  const { handle, runFlow } = owner
  return {
    handle,
    failure,
    runFlow,
    libraryAssets,
    retryBoot,
    startFreshProject,
    rememberSavedProject,
  }
}
