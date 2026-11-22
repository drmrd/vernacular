import { useEffect, useMemo, useState } from 'react'
import {
  ActiveFloorProvider,
  AssetRegistryProvider,
  EditorSessionProvider,
  SceneHarnessView,
  SelectionProvider,
} from '../bridge'
import {
  ActiveToolProvider,
  EditLayerProvider,
  DiscardDialog,
  EditorShell,
  initialToolForProject,
} from '../editor'
import { AppSettings, type AppSettingsProps } from './app-settings'
import { AssetProviders } from './asset-providers'
import { createHarnessAssetRegistry } from './create-asset-library-registry'
import type { BuiltSessionPorts } from './create-session-ports'
import { NotificationProvider, ThemeProvider } from '../editor/design-system'
import { probeStorageCapabilities, type AssetCache, type StorageCapabilities } from '../storage'
import type { DocumentHandle, SessionPorts } from '../session'
import { type SurfaceTreatment } from '../core'
import { harnessEnvironmentState, resolveHarnessScene } from './harness-environment'
import { resolveHarnessPaint } from './harness-paint'
import type { AddressBar } from './address-bar'
import { ProjectsScreen, type ProjectsScreenProps } from './projects-screen'
import type { PageScreen } from './resolve-place'
import { useUnsavedChangesGuard } from './use-before-unload-guard'
import { useFlushOnHidden } from './use-flush-on-hidden'
import type { HistoryNavigation } from './use-history-navigation'
import { useDegradedStorageBanner } from './use-degraded-storage-banner'
import { useProjectBoot } from './use-project-boot'
import { useSessionKey } from './use-session-key'
import { useDiscardPrompt } from './use-discard-prompt'
import type { RunFlow } from './use-open-project'
import { requestedDesignLanguage, searchParam } from './url-seams'
import { useWorkspaceState } from './use-workspace-state'

export type { BuiltSessionPorts } from './create-session-ports'

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

export interface AppProps {
  /** Injected ports (tests, stories). When set, nothing is resolved. */
  ports?: SessionPorts
  /** Builds the ports. Defaults to the builder of the application. */
  resolvePorts?: () => Promise<BuiltSessionPorts>
  /** The pool of the user's library. Defaults to the built one, or in memory under `ports`. */
  libraryAssets?: AssetCache
  /** The address bar. Defaults to the one of the window, or one in memory under `ports`. */
  address?: AddressBar
  /** The port of the user settings (tests). Defaults to the settings that this browser keeps. */
  settings?: AppSettingsProps['port']
}

export function App(props: AppProps) {
  if (requestedFixture() === SCENE_HARNESS_FIXTURE) {
    return <SceneHarnessApp />
  }
  // The notification provider wraps AppWorkspace (not a tree inside EditorWorkspace) so every emit
  // site sits under it: the storage check in AppWorkspace's body and the file-op hooks in
  // EditorWorkspace's body both run above their returned trees, so the provider must be their ancestor.
  return (
    <AppSettings port={props.settings}>
      <NotificationProvider>
        <AppWorkspace {...props} />
      </NotificationProvider>
    </AppSettings>
  )
}

function SceneHarnessApp() {
  // Made once: a registry made on each render would start the texture load again.
  const registry = useMemo(() => createHarnessAssetRegistry(globalThis.fetch.bind(globalThis)), [])
  // The `?scene=` param names either a harness geometry fixture or a named
  // environment state; see resolveHarnessScene in harness-environment.ts for the
  // shared keyspace and resolution precedence between the two.
  const sceneParam = searchParam('scene')
  const environment = harnessEnvironmentState(sceneParam)
  return (
    <AssetRegistryProvider registry={registry}>
      <SceneHarnessView
        colorTemperatureK={requestedColorTemperature()}
        paint={requestedHarnessPaint()}
        scene={resolveHarnessScene(sceneParam ?? undefined)}
        environment={environment}
      />
    </AssetRegistryProvider>
  )
}

function AppWorkspace(props: AppProps) {
  const boot = useProjectBoot(props)
  const { navigation, libraryAssets, ports } = boot
  const { screen } = navigation
  const capabilities = useStorageCapabilities()
  useDegradedStorageBanner(navigation.handle, capabilities)
  // Lives above the editor, which unmounts while the page shows over the open project.
  const [offeredRecovery] = useState(() => new WeakSet<DocumentHandle>())

  if (screen?.kind === 'projects') {
    return pageOverProjectView(navigation, screen, { ports, libraryAssets })
  }
  if (screen === null || ports === null || libraryAssets === null || capabilities === null) {
    return bootLoadingView()
  }

  return (
    <EditorWorkspace
      handle={screen.handle}
      runFlow={navigation.runFlow}
      libraryAssets={libraryAssets}
      ports={ports}
      capabilities={capabilities}
      offeredRecovery={offeredRecovery}
      showProjects={navigation.showProjects}
    />
  )
}

// The page in place of the editor. A project that stays open under it keeps its guards of unsaved
// work, since the editor that mounts them otherwise is not mounted.
function pageOverProjectView(
  navigation: HistoryNavigation,
  screen: PageScreen,
  stores: Pick<ProjectsScreenProps, 'ports' | 'libraryAssets'>,
) {
  const { handle } = navigation
  return (
    <>
      {handle === null ? null : <UnsavedWorkGuards handle={handle} />}
      <ProjectsScreen navigation={navigation} screen={screen} {...stores} />
    </>
  )
}

// Warns before the tab closes with unsaved changes, and writes when the tab is hidden.
function UnsavedWorkGuards({ handle }: { readonly handle: DocumentHandle }) {
  useUnsavedChangesGuard(handle)
  useFlushOnHidden(handle)
  return null
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

// The pre-shell placeholder while the ports or the project are still resolving.
function bootLoadingView() {
  return (
    <main aria-label="Loading">
      <p role="status">Loading project...</p>
    </main>
  )
}

export interface EditorWorkspaceProps {
  handle: DocumentHandle
  runFlow: RunFlow
  libraryAssets: AssetCache
  /** The ports of the latest render, for the list of recent projects. */
  ports: SessionPorts
  capabilities: StorageCapabilities
  /** The handles whose recovered work was offered already; each is offered once over remounts. */
  offeredRecovery?: WeakSet<DocumentHandle>
  /** Shows the Projects page over the open project. */
  showProjects?: () => void
}

export function EditorWorkspace(props: EditorWorkspaceProps) {
  const { session } = props.handle
  const ws = useWorkspaceState(props)
  const projectName = session.getProject().meta.name
  const prompt = useDiscardPrompt(ws, projectName)
  // Remount the tool provider when a new handle brings a new session (mid-session New,
  // Open, or restore) so a fresh empty project re-arms the wall tool (#351), keeping
  // the #318 initial-tool decision in sync past the very first mount.
  const sessionKey = useSessionKey(session)

  return (
    <ThemeProvider designLanguage={requestedDesignLanguage()}>
      <EditorSessionProvider session={session}>
        <AssetProviders handle={props.handle} library={ws.assetLibrary}>
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
