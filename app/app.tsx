import { useEffect, useMemo, useState } from 'react'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SceneHarnessView,
  SelectionProvider,
  type HarnessScene,
  createEditorSession,
  loadOrCreateProject,
  type EditorSession,
} from '../bridge'
import { ActiveToolProvider, DiscardDialog, EditorShell } from '../editor'
import { AssetProviders } from './asset-providers'
import { ThemeProvider } from '../editor/design-system'
import {
  InMemoryAssetCache,
  InMemoryRecentProjectStore,
  isStorageDegraded,
  probeStorageCapabilities,
  summarizeStorageCapabilities,
  type AssetCache,
  type ProjectStorage,
  type ProjectStore,
  type RecentProjectStore,
  type StorageCapabilities,
} from '../storage'
import {
  colorFromHex,
  solidTreatment,
  surfaceKey,
  type Project,
  type SurfaceTreatment,
} from '../core'
import { createInitialProject } from './create-initial-project'
import { resolveProjectStorage } from './resolve-project-store'
import { useWorkspaceState } from './use-workspace-state'
import { validateLoadedProject } from './validate-loaded-project'

const DEFAULT_PROJECT_ID = 'current'

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

// A fixed demo paint store for the painted-shell baseline
// (`?fixture=scene-harness&paint=demo`): the harness room's floor painted a distinct
// color so the committed baseline shows real paint on a surface.
const DEMO_FLOOR_HEX = '#cc6633'
const DEMO_WALL_HEX = '#3f7f5f'
// The harness room's four walls (model ids, the scene `wall:` prefix stripped). South
// hosts the door (an opening wall), so painting all four exercises both wall mesh paths.
const DEMO_WALL_IDS = ['south', 'east', 'north', 'west']

// Selects the harness fixture (`?fixture=scene-harness&scene=junctions`); the default
// renders the wall-shell room, `junctions` renders the T-junction and acute-bay fixture
// for the junction-geometry baseline (ADR-0080), and `furniture` renders the wall shell
// with one massing box for the furniture baseline (ADR-0094).
function requestedHarnessScene(): HarnessScene | undefined {
  const scene = searchParam('scene')
  return scene === 'junctions' || scene === 'furniture' ? scene : undefined
}

function requestedHarnessPaint(): Record<string, SurfaceTreatment> | undefined {
  if (searchParam('paint') !== 'demo') return undefined
  const store: Record<string, SurfaceTreatment> = {
    [surfaceKey({ kind: 'floor', floorId: 'demo' })]: solidTreatment(
      colorFromHex(DEMO_FLOOR_HEX),
      'matte',
    ),
  }
  for (const wallId of DEMO_WALL_IDS) {
    store[surfaceKey({ kind: 'wall-face', wallId, side: 'right' })] = solidTreatment(
      colorFromHex(DEMO_WALL_HEX),
      'matte',
    )
  }
  return store
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
}

export function App(props: AppProps) {
  if (requestedFixture() === SCENE_HARNESS_FIXTURE) {
    return (
      <SceneHarnessView
        colorTemperatureK={requestedColorTemperature()}
        paint={requestedHarnessPaint()}
        scene={requestedHarnessScene()}
      />
    )
  }
  return <AppWorkspace {...props} />
}

function AppWorkspace({
  store: providedStore,
  assets: providedAssets,
  resolveStore,
  projectId = DEFAULT_PROJECT_ID,
  recentProjects: providedRecentProjects,
  snapshots,
}: AppProps) {
  const { store, assets, session, setSession, error } = useProjectBoot({
    providedStore,
    providedAssets,
    resolveStore,
    projectId,
  })
  const recentProjects = useMemo(
    () => providedRecentProjects ?? new InMemoryRecentProjectStore(),
    [providedRecentProjects],
  )
  const capabilities = useStorageCapabilities()

  if (error !== null) {
    return bootStatusView(error)
  }
  if (store === null || assets === null || session === null || capabilities === null) {
    return bootStatusView(null)
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
      if (isStorageDegraded(probed)) {
        console.warn(summarizeStorageCapabilities(probed))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  return capabilities
}

// The pre-shell placeholder: the error notice when boot failed, otherwise the
// loading notice while the store or project is still resolving.
function bootStatusView(error: Error | null) {
  if (error !== null) {
    return (
      <main aria-label="Error">
        <p role="alert">Could not open the project. Reload the page to try again.</p>
      </main>
    )
  }
  return (
    <main aria-label="Loading">
      <p role="status">Loading project...</p>
    </main>
  )
}

interface ProjectBoot {
  store: ProjectStore | null
  assets: AssetCache | null
  session: EditorSession | null
  setSession: (session: EditorSession) => void
  error: Error | null
}

interface ProjectBootInputs {
  providedStore: ProjectStore | undefined
  providedAssets: AssetCache | undefined
  resolveStore: (() => Promise<ProjectStore>) | undefined
  projectId: string
}

// Boots the project: uses an injected store directly, otherwise resolves the
// durable {store, assets} pair asynchronously exactly once, then loads or creates
// the project. An injected store pairs with the injected asset cache or a fresh
// in-memory one. Each async step is guarded against writes after unmount, and the
// store and load errors surface through a single error channel.
function useProjectBoot(inputs: ProjectBootInputs): ProjectBoot {
  const { providedStore, providedAssets, resolveStore, projectId } = inputs
  const [resolved, setResolved] = useState<ProjectStorage | null>(null)
  const [session, setSession] = useState<EditorSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const fallbackAssets = useMemo(() => new InMemoryAssetCache(), [])
  const store = providedStore ?? resolved?.store ?? null
  const assets = providedAssets ?? resolved?.assets ?? (providedStore ? fallbackAssets : null)

  useEffect(() => {
    if (providedStore) {
      return
    }
    let cancelled = false
    void resolveBootStorage(resolveStore)
      .then((it) => !cancelled && setResolved(it))
      .catch((cause: unknown) => !cancelled && setError(asError(cause)))
    return () => {
      cancelled = true
    }
  }, [providedStore, resolveStore])

  useEffect(() => {
    if (store === null) {
      return
    }
    let cancelled = false
    void loadOrCreateProject(store, projectId, createInitialProject)
      .then((project) => {
        if (cancelled) {
          return
        }
        // Non-fatal dev gate: warn if the migrated Document fails CORE shape (VFPF sections 7, 8).
        validateLoadedProject(project)
        setSession(createEditorSession(project))
      })
      .catch((cause: unknown) => !cancelled && setError(asError(cause)))
    return () => {
      cancelled = true
    }
  }, [store, projectId])

  return { store, assets, session, setSession, error }
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

  return (
    <ThemeProvider>
      <EditorSessionProvider session={session}>
        <AssetProviders assets={assets} library={ws.assetLibrary}>
          <SelectionProvider store={ws.selection}>
            <ActiveFloorProvider store={ws.activeFloorStore}>
              <ActiveToolProvider>
                <EditorShell
                  saveStatus={ws.saveStatus}
                  recentProjects={ws.recentEntries}
                  {...ws.actions}
                  onDismissImportStatus={ws.actions.dismissImportStatus}
                  // Spread recovery only when present: the optional prop rejects an explicit undefined.
                  {...(ws.recovery ? { recovery: ws.recovery } : {})}
                />
                <DiscardDialog
                  open={ws.discardRequest !== null}
                  projectName={session.getProject().meta.name}
                  onConfirm={() => ws.resolveDiscard(true)}
                  onCancel={() => ws.resolveDiscard(false)}
                />
              </ActiveToolProvider>
            </ActiveFloorProvider>
          </SelectionProvider>
        </AssetProviders>
      </EditorSessionProvider>
    </ThemeProvider>
  )
}
