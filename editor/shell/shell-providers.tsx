import { useMemo, type ReactNode } from 'react'
import {
  createEnvironmentSessionStore,
  createPerceivedColorStore,
  createSceneSessionStore,
  createSurfaceSelectionStore,
  EnvironmentSessionProvider,
  PerceivedColorProvider,
  SceneSessionProvider,
  SurfaceSelectionProvider,
  useActiveFloorId,
  useEditorSession,
  useSceneGraph,
  useSelection,
} from '../../bridge'
import { sceneGraphForFloor } from '../../core'
import {
  CommandPalette,
  CommandPaletteProvider,
  createCommandSet,
  useCommandPalette,
  useKeybindings,
} from '../commands'
import { useEntitySurfaceBridge } from '../paint/use-entity-surface-bridge'
import { FurniturePlacementProvider } from '../plan/furniture-placement-context'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { PLAN_HEIGHT, PLAN_WIDTH } from '../plan/plan-scene'
import { createSnapPreferencesStore } from '../plan/snap-preferences-store'
import { useSnapPreferencesStore } from '../plan/snap-preferences-context'
import { SnapPreferencesProvider } from '../plan/snap-preferences-provider'
import { UnderlayProvider } from '../plan/use-underlay'
import { ViewportProvider, type ViewportInitialContent } from '../plan/viewport-context'
import { PointerReadoutProvider } from '../plan/pointer-readout'
import { ViewModeProvider, useViewMode } from '../viewport/view-mode'
import { ViewOverlayProvider } from '../viewport/view-overlay-context'
import { ToastRegion } from '../design-system'

// A render-nothing layer that assembles the command context from the editor
// hooks and registers the global keybindings (undo/redo/delete/deselect/palette).
function KeybindingLayer({ onSave }: { onSave?: (() => void) | undefined }) {
  const session = useEditorSession()
  const selection = useSelection()
  const activeFloorId = useActiveFloorId()
  const graph = useSceneGraph()
  const palette = useCommandPalette()
  const view = useViewMode()
  const snapStore = useSnapPreferencesStore()
  const commands = useMemo(
    () => createCommandSet({ view, snapStore, onSave }),
    [view, snapStore, onSave],
  )
  useKeybindings(commands, { session, selection, graph, activeFloorId, openPalette: palette.open })
  return null
}

// A render-nothing layer that defaults the active paint surface to a selected
// wall's first face, so clicking a wall on the plan also chooses what to paint.
function EntitySurfaceBridge() {
  useEntitySurfaceBridge()
  return null
}

interface ProviderLayerProps {
  onSave?: (() => void) | undefined
  children: ReactNode
}

/**
 * The stores the frame's panels share, and the render-nothing layers that ride them.
 * Each store is created once: the surface selection joins the paint inspector to the
 * viewport, the perceived color joins that viewport's sampler to the inspector
 * readout, and the environment session joins the tool rail's Environment panel to the
 * 3D viewport. The scene session joins the 3D viewport's session state to a store that
 * outlives the preview subtree's unmount on a view-mode switch (ADR-0170).
 */
function SessionStateProviders({ onSave, children }: ProviderLayerProps) {
  const surfaceSelection = useMemo(() => createSurfaceSelectionStore(), [])
  const environmentSession = useMemo(() => createEnvironmentSessionStore(), [])
  const perceivedColor = useMemo(() => createPerceivedColorStore(), [])
  const sceneSession = useMemo(() => createSceneSessionStore(), [])
  return (
    <>
      <KeybindingLayer onSave={onSave} />
      <CommandPalette />
      <ToastRegion />
      <SurfaceSelectionProvider store={surfaceSelection}>
        <EntitySurfaceBridge />
        <PerceivedColorProvider store={perceivedColor}>
          <EnvironmentSessionProvider store={environmentSession}>
            <SceneSessionProvider store={sceneSession}>{children}</SceneSessionProvider>
          </EnvironmentSessionProvider>
        </PerceivedColorProvider>
      </SurfaceSelectionProvider>
    </>
  )
}

/**
 * The editor's provider pyramid, wrapped around whatever frame it is given. The
 * command-palette provider sits outermost so the keybinding layer, the command bar,
 * and the palette dialog share one open/close state. The snap preferences are created
 * once here and read by the keybinding layer, the command palette, the snap panel, and
 * the plan's snapping, persisted to localStorage as an editor preference. The underlay
 * and opening-tool providers wrap the frame so the shared underlay state and the
 * opening placement type reach the canvas glue and the inspector and tools panels from
 * one source. The viewport provider reads the active floor's already-drawn walls and
 * rooms so a document that opens with content already on it frames that content
 * instead of the default scale.
 */
export function ShellProviders({ onSave, children }: ProviderLayerProps) {
  const snapPreferences = useMemo(() => createSnapPreferencesStore(), [])
  const sceneGraph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  const activeFloorGraph = useMemo(
    () => sceneGraphForFloor(sceneGraph, activeFloorId),
    [sceneGraph, activeFloorId],
  )
  const initialContent: ViewportInitialContent = useMemo(
    () => ({
      walls: activeFloorGraph.walls,
      rooms: activeFloorGraph.rooms,
      size: { width: PLAN_WIDTH, height: PLAN_HEIGHT },
    }),
    [activeFloorGraph],
  )
  return (
    <CommandPaletteProvider>
      <SnapPreferencesProvider store={snapPreferences}>
        <ViewModeProvider>
          <ViewOverlayProvider>
            <ViewportProvider initialContent={initialContent}>
              <PointerReadoutProvider>
                <UnderlayProvider>
                  <OpeningToolProvider>
                    <FurniturePlacementProvider>
                      <SessionStateProviders onSave={onSave}>{children}</SessionStateProviders>
                    </FurniturePlacementProvider>
                  </OpeningToolProvider>
                </UnderlayProvider>
              </PointerReadoutProvider>
            </ViewportProvider>
          </ViewOverlayProvider>
        </ViewModeProvider>
      </SnapPreferencesProvider>
    </CommandPaletteProvider>
  )
}
