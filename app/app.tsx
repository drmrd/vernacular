import { useEffect, useMemo, useState } from 'react'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SceneHarnessView,
  SelectionProvider,
  createEditorSession,
  loadOrCreateProject,
  type EditorSession,
} from '../bridge'
import {
  ActiveToolProvider,
  EditLayerProvider,
  DiscardDialog,
  EditorShell,
  initialToolForProject,
} from '../editor'
import { AssetProviders } from './asset-providers'
import {
  DESIGN_LANGUAGE_PREVIEW_PARAM,
  NotificationProvider,
  ThemeProvider,
  humanMessage,
  resolveDesignLanguage,
  type DesignLanguage,
} from '../editor/design-system'
import {
  InMemoryAssetCache,
  InMemoryProjectStore,
  InMemoryRecentProjectStore,
  probeStorageCapabilities,
  type AssetCache,
  type ProjectStorage,
  type ProjectStore,
  type RecentProjectStore,
  type StorageCapabilities,
} from '../storage'
import { type Project, type SurfaceTreatment } from '../core'
import { createInitialProject } from './create-initial-project'
import { harnessEnvironmentState, resolveHarnessScene } from './harness-environment'
import { resolveHarnessPaint } from './harness-paint'
import { resolveProjectStorage } from './resolve-project-store'
import { useDegradedStorageBanner } from './use-degraded-storage-banner'
import { useResolvedSnapshots } from './use-resolved-snapshots'
import { useSessionKey } from './use-session-key'
import { useDiscardPrompt } from './use-discard-prompt'
import { useWorkspaceState } from './use-workspace-state'
import { validateLoadedProject } from './validate-loaded-project'

export const DEFAULT_PROJECT_ID = 'current'

// Test-only render-harness seam. When `?fixture=scene-harness` is present the app
// mounts the deterministic three-dimensional render harness instead of the editor, so
// the Playwright visual baseline boots a fixed scene with no storage, autosave, or
// editor chrome in the frame. A normal page load never carries this parameter, so it
// is a no-op for real users (mirrors the `e2e-storage` hook in src/main.tsx).
const SCENE_HARNESS_FIXTURE = 'scene-harness'
// Optional color temperature for the harness, so the visual baseline can capture a warm
// render alongside the default one (`?fixture=scene-harness&temp=2700`). Out of range or
// missing values fall back to the harness default; the harness clamps through the
// kelvin-to-color conversion either way.
const COLOR_TEMPERATURE_PARAM = 'temp'

function searchParam(name: string): string | null {
  return new URLSearchParams(globalThis.location?.search ?? '').get(name)
}

function requestedFixture(): string | null {
  return searchParam('fixture')
}

function requestedColorTemperature(): number | undefined {
  const raw = searchParam(COLOR_TEMPERATURE_PARAM)
  if (raw === null) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function requestedHarnessPaint(): Record<string, SurfaceTreatment> | undefined {
  return resolveHarnessPaint(searchParam('paint'))
}

// Preview seam for the in-progress Arris visual language (ADR-0154): `?theme-preview=arris`
// mounts the Arris token layer instead of the shipped one. A normal page load carries no
// such parameter, so the shipped language is what every real user gets; the migration plan
// flips the default only once every component family has moved.
// eslint-disable-next-line react-refresh/only-export-components -- every URL seam in this app reads through the one searchParam helper here, so the reader belongs beside its siblings rather than in a module of its own; it is exported only so the seam itself is unit-testable.
export function requestedDesignLanguage(): DesignLanguage {
  return resolveDesignLanguage(searchParam(DESIGN_LANGUAGE_PREVIEW_PARAM))
}

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

/** The subset of SnapshotStore the app depends on for autosave and crash recovery. */
export interface SnapshotsPort {
  writeSnapshot(project: Project): Promise<void>
  prune(): Promise<void>
  isRecoverable(): Promise<boolean>
  restore(): Promise<Project | undefined>
}

export interface AppProps {
  store?: ProjectStore
  /** Injected asset cache; defaults to the boot-resolved cache, or in-memory under an injected store. */
  assets?: AssetCache
  resolveStore?: () => Promise<ProjectStore>
  projectId?: string
  recentProjects?: RecentProjectStore
  snapshots?: SnapshotsPort
  resolveSnapshots?: () => Promise<SnapshotsPort | undefined>
}

export function App(props: AppProps) {
  if (requestedFixture() === SCENE_HARNESS_FIXTURE) {
    // The `?scene=` param names either a harness geometry fixture or a named
    // environment state; see resolveHarnessScene in harness-environment.ts for the
    // shared keyspace and resolution precedence between the two.
    const sceneParam = searchParam('scene')
    const environment = harnessEnvironmentState(sceneParam)
    return (
      <SceneHarnessView
        colorTemperatureK={requestedColorTemperature()}
        paint={requestedHarnessPaint()}
        scene={resolveHarnessScene(sceneParam ?? undefined)}
        environment={environment}
      />
    )
  }
  // The notification provider wraps AppWorkspace (not a tree inside EditorWorkspace) so every emit
  // site sits under it: the storage check in AppWorkspace's body and the file-op hooks in
  // EditorWorkspace's body both run above their returned trees, so the provider must be their ancestor.
  return (
    <NotificationProvider>
      <AppWorkspace {...props} />
    </NotificationProvider>
  )
}

function AppWorkspace({
  store: providedStore,
  assets: providedAssets,
  resolveStore,
  projectId = DEFAULT_PROJECT_ID,
  recentProjects: providedRecentProjects,
  snapshots: providedSnapshots,
  resolveSnapshots,
}: AppProps) {
  const { store, assets, session, setSession, error, retryBoot, startFreshProject } =
    useProjectBoot({ providedStore, providedAssets, resolveStore, projectId })
  const snapshots = useResolvedSnapshots(providedSnapshots, resolveSnapshots)
  const recentProjects = useMemo(
    () => providedRecentProjects ?? new InMemoryRecentProjectStore(),
    [providedRecentProjects],
  )
  const capabilities = useStorageCapabilities()
  useDegradedStorageBanner(capabilities)

  if (error !== null) {
    return bootErrorView(error, retryBoot, startFreshProject)
  }
  if (store === null || assets === null || session === null || capabilities === null) {
    return bootLoadingView()
  }

  return (
    <EditorWorkspace
      session={session}
      store={store}
      assets={assets}
      projectId={projectId}
      recentProjects={recentProjects}
      capabilities={capabilities}
      snapshots={snapshots}
      onSession={setSession}
    />
  )
}

// Storage capabilities are a fixed property of the host environment, so probe
// once at mount and reuse the result for both the degraded-storage warning and
// the open-folder capability gate. Resolves to null until the probe completes.
function useStorageCapabilities(): StorageCapabilities | null {
  const [capabilities, setCapabilities] = useState<StorageCapabilities | null>(null)
  useEffect(() => {
    let cancelled = false
    void probeStorageCapabilities().then((probed) => {
      if (cancelled) {
        return
      }
      setCapabilities(probed)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return capabilities
}

// The pre-shell placeholder while the store or the project is still resolving.
function bootLoadingView() {
  return (
    <main aria-label="Loading">
      <p role="status">Loading project...</p>
    </main>
  )
}

// The pre-shell failure notice: why the boot failed and the two ways out of it.
// A stored document that fails every load (corrupt bytes, a broken migration)
// would otherwise lock the user out on every reload. Plain elements, because this
// renders above the editor's provider tree.
function bootErrorView(error: Error, onRetry: () => void, onStartFresh: () => void) {
  return (
    <main aria-label="Error">
      <p role="alert">Could not open the project: {humanMessage(error)}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
      <button type="button" onClick={onStartFresh}>
        Start a new project
      </button>
      <p>A new project leaves the saved one where it is until you save over it.</p>
    </main>
  )
}

interface ProjectBoot {
  store: ProjectStore | null
  assets: AssetCache | null
  session: EditorSession | null
  setSession: (session: EditorSession) => void
  error: Error | null
  /** Re-run the failed boot from the top (a transient I/O fault deserves a second go). */
  retryBoot: () => void
  /** Leave the unreadable stored project alone and work in a fresh empty one. */
  startFreshProject: () => void
}

interface ProjectBootInputs {
  providedStore: ProjectStore | undefined
  providedAssets: AssetCache | undefined
  resolveStore: (() => Promise<ProjectStore>) | undefined
  projectId: string
}

// Boots the project in two steps: resolve the durable {store, assets} pair (skipped
// for an injected store, which pairs with the injected asset cache or a fresh
// in-memory one), then load or create the project. Both steps report through one
// error channel and are guarded against writes after unmount. Each stands down once
// it holds its own result, so Retry (which just clears the error) re-runs only the
// step that failed rather than swapping a resolved store under a live session.
function useProjectBoot(inputs: ProjectBootInputs): ProjectBoot {
  const { providedStore, providedAssets, resolveStore, projectId } = inputs
  const [resolved, setResolved] = useState<ProjectStorage | null>(null)
  const [session, setSession] = useState<EditorSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const fallbackAssets = useMemo(() => new InMemoryAssetCache(), [])
  const store = providedStore ?? resolved?.store ?? null
  const assets = providedAssets ?? resolved?.assets ?? (providedStore ? fallbackAssets : null)

  useEffect(() => {
    if (providedStore || resolved !== null || error !== null) return
    let cancelled = false
    void resolveBootStorage(resolveStore)
      .then((it) => !cancelled && setResolved(it))
      .catch((cause: unknown) => !cancelled && setError(asError(cause)))
    return () => {
      cancelled = true
    }
  }, [providedStore, resolveStore, resolved, error])

  useEffect(() => {
    if (store === null || session !== null || error !== null) return
    let cancelled = false
    void loadOrCreateProject(store, projectId, createInitialProject)
      .then((project) => !cancelled && setSession(createEditorSession(validatedProject(project))))
      .catch((cause: unknown) => !cancelled && setError(asError(cause)))
    return () => {
      cancelled = true
    }
  }, [store, projectId, session, error])

  const startFreshProject = () => {
    setError(null)
    // A failed storage resolution leaves no store at all; an in-memory pair keeps the
    // fresh project workable. The stored project is untouched either way: only an
    // explicit save replaces it.
    setResolved((current) => current ?? freshStorage())
    setSession(createEditorSession(createInitialProject()))
  }
  const retryBoot = () => setError(null)
  return { store, assets, session, setSession, error, retryBoot, startFreshProject }
}

// Non-fatal dev gate: warns if the migrated Document fails CORE shape (VFPF sections 7, 8).
function validatedProject(project: Project): Project {
  validateLoadedProject(project)
  return project
}

function freshStorage(): ProjectStorage {
  return { store: new InMemoryProjectStore(), assets: new InMemoryAssetCache() }
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('Failed to boot the project')
}

export interface EditorWorkspaceProps {
  session: EditorSession
  store: ProjectStore
  assets: AssetCache
  projectId: string
  recentProjects: RecentProjectStore
  capabilities: StorageCapabilities
  snapshots: SnapshotsPort | undefined
  onSession: (session: EditorSession) => void
}

export function EditorWorkspace(props: EditorWorkspaceProps) {
  const { session, assets } = props
  const ws = useWorkspaceState(props)
  const projectName = session.getProject().meta.name
  const prompt = useDiscardPrompt(ws, projectName)
  // Remount the tool provider when the active session is replaced (mid-session New,
  // Open, or restore) so a fresh empty project re-arms the wall tool (#351), keeping
  // the #318 initial-tool decision in sync past the very first mount.
  const sessionKey = useSessionKey(session)

  return (
    <ThemeProvider designLanguage={requestedDesignLanguage()}>
      <EditorSessionProvider session={session}>
        <AssetProviders assets={assets} library={ws.assetLibrary}>
          <SelectionProvider store={ws.selection}>
            <ActiveFloorProvider store={ws.activeFloorStore}>
              <ActiveToolProvider
                key={sessionKey}
                initialTool={initialToolForProject(session.getProject())}
              >
                <EditLayerProvider>
                  <EditorShell
                    saveStatus={ws.saveStatus}
                    recentProjects={ws.recentEntries}
                    {...ws.actions}
                    // Spread recovery only when present: the optional prop rejects an explicit undefined.
                    {...(prompt.recovery ? { recovery: prompt.recovery } : {})}
                  />
                  <DiscardDialog
                    open={ws.discardRequest !== null}
                    projectName={projectName}
                    message={prompt.message}
                    confirmLabel={prompt.confirmLabel}
                    onConfirm={() => prompt.answer(true)}
                    onCancel={() => prompt.answer(false)}
                  />
                </EditLayerProvider>
              </ActiveToolProvider>
            </ActiveFloorProvider>
          </SelectionProvider>
        </AssetProviders>
      </EditorSessionProvider>
    </ThemeProvider>
  )
}
