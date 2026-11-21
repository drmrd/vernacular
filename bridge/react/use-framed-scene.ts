import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react'

import type { SceneGraph } from '../../core'

import type { FramedScene } from './framed-scene'
import { createFramedSceneReconciler, type FramedSceneReconciler } from './framed-scene-reconciler'
import { sceneSessionToggle, useSceneSessionStoreOrLocal } from './scene-session-context'
import type { BuildingViewState } from './use-building-view-state'
import { useFurnitureModelCache } from './use-furniture-model-cache'
import { useProjectPaint } from './use-project-paint'
import { useShownSceneGraph } from './use-view-scene-graph'

/** The surface-edge overlay setting together with the toggle that flips it. */
export interface EdgeOverlayState {
  edgeOverlay: boolean
  toggleEdgeOverlay: () => void
}

/**
 * Per-view surface-edge overlay session state, never in the model or undo. The setting lives in
 * the scene session store, so it survives the preview subtree's unmount when the view mode
 * changes (ADR-0170). Off by default in Orbit (ADR-0132); it feeds the toolbar toggle and the
 * reconciler's view options.
 */
export function useEdgeOverlay(): EdgeOverlayState {
  const store = useSceneSessionStoreOrLocal()
  const session = useSyncExternalStore(store.subscribe, store.getSceneSession)
  const toggleEdgeOverlay = useMemo(() => sceneSessionToggle(store, 'edgeOverlay'), [store])
  return { edgeOverlay: session.edgeOverlay, toggleEdgeOverlay }
}

/**
 * What waits to be freed and whether the renderer's React root draws a scene now. React Three
 * Fiber commits the Canvas children in its own React root, at least one task after react-dom
 * commits, and the frame loop keeps drawing the replaced scene root until then. So while a scene
 * is attached, retired resources are freed only when that root reports the new scene.
 */
interface SceneReleaseState {
  superseded: Set<FramedSceneReconciler>
  attached: boolean
  mounted: boolean
}

function disposeSupersededExcept(release: SceneReleaseState, current: FramedSceneReconciler) {
  for (const superseded of release.superseded) {
    if (superseded === current) continue
    superseded.dispose()
    release.superseded.delete(superseded)
  }
}

interface ReconcilerLifetime {
  reconciler: FramedSceneReconciler
  release: RefObject<SceneReleaseState>
}

function useReconcilerLifetime(edgeOverlay: boolean): ReconcilerLifetime {
  const reconciler = useMemo(() => createFramedSceneReconciler({ edgeOverlay }), [edgeOverlay])
  const release = useRef<SceneReleaseState>({
    superseded: new Set(),
    attached: false,
    mounted: false,
  })
  useEffect(() => {
    const state = release.current
    state.mounted = true
    state.superseded.delete(reconciler)
    return () => {
      state.mounted = false
      state.superseded.add(reconciler)
      queueMicrotask(() => {
        if (state.mounted) return
        for (const waiting of state.superseded) waiting.dispose()
        state.superseded.clear()
      })
    }
  }, [reconciler])
  return { reconciler, release }
}

// Frees what the reconcile replaced once it is no longer drawn. While no scene is attached
// (the renderer is loading, starting, or could not start), nothing draws, so the effect frees
// after its own commit. While one is attached, the release waits for onSceneAttached, which the
// renderer's React root calls in the commit that swaps the scene root.
function useSceneRelease(
  { reconciler, release }: ReconcilerLifetime,
  framed: FramedScene,
): (scene: FramedScene) => () => void {
  useEffect(() => {
    const state = release.current
    if (state.attached) return
    disposeSupersededExcept(state, reconciler)
    reconciler.releaseRetired(framed)
  }, [reconciler, release, framed])
  return useCallback(
    (scene: FramedScene) => {
      const state = release.current
      state.attached = true
      disposeSupersededExcept(state, reconciler)
      reconciler.releaseRetired(scene)
      return () => {
        state.attached = false
      }
    },
    [reconciler, release],
  )
}

/** The framed scene together with the session state that shapes it. */
export interface FramedSceneState {
  graph: SceneGraph
  buildingView: BuildingViewState
  edgeOverlay: boolean
  toggleEdgeOverlay: () => void
  framed: FramedScene
  modelsVersion: number
  /**
   * Reports that the renderer's React root now draws `scene`; frees what it replaced. The
   * returned function reports that the root no longer draws it and frees nothing.
   */
  onSceneAttached: (scene: FramedScene) => () => void
}

/**
 * The framed-scene wiring for the live scene view: it subscribes to the live scene
 * graph, scopes it to the active floor or the whole building, joins the project's
 * paint and each furniture instance's loaded model, and reconciles the result into a
 * framed scene. The edge-overlay toggle lives here because the reconciler is keyed
 * on it.
 */
export function useFramedScene(): FramedSceneState {
  const { graph, buildingView } = useShownSceneGraph()
  const paint = useProjectPaint()
  const { edgeOverlay, toggleEdgeOverlay } = useEdgeOverlay()
  const lifetime = useReconcilerLifetime(edgeOverlay)
  const { reconciler } = lifetime
  const models = useFurnitureModelCache(graph)
  const framed = useMemo(
    () => reconciler.reconcile(graph, paint, models.lookup),
    [reconciler, graph, paint, models],
  )
  const onSceneAttached = useSceneRelease(lifetime, framed)
  return {
    graph,
    buildingView,
    edgeOverlay,
    toggleEdgeOverlay,
    framed,
    modelsVersion: models.version,
    onSceneAttached,
  }
}
