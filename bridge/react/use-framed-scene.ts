import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react'

import { GROUND_GRASS_REFERENCE, type SceneGraph } from '../../core'

import { useAssetRegistry } from './asset-registry-context'
import type { FramedScene } from './framed-scene'
import { createFramedSceneReconciler, type FramedSceneReconciler } from './framed-scene-reconciler'
import { sceneSessionToggle, useSceneSessionStoreOrLocal } from './scene-session-context'
import type { TextureStatus } from './texture-cache'
import type { BuildingViewState } from './use-building-view-state'
import { useFurnitureModelCache } from './use-furniture-model-cache'
import { useGroundTexture } from './use-ground-texture'
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

function disposeSupersededExcept(state: SceneReleaseState, current: FramedSceneReconciler) {
  for (const superseded of state.superseded) {
    if (superseded === current) continue
    superseded.dispose()
    state.superseded.delete(superseded)
  }
}

// The release rule: what the current reconciler replaced, and every reconciler a flip
// replaced, is freed once `scene` is the one drawn or nothing draws.
function releaseReplaced(
  state: SceneReleaseState,
  reconciler: FramedSceneReconciler,
  scene: FramedScene,
) {
  disposeSupersededExcept(state, reconciler)
  reconciler.releaseRetired(scene)
}

function adoptReconciler(state: SceneReleaseState, reconciler: FramedSceneReconciler) {
  state.mounted = true
  state.superseded.delete(reconciler)
}

// A cleanup that no setup follows before the microtask is an unmount, not a flip or a
// StrictMode remount; then every waiting reconciler is disposed.
function retireReconciler(state: SceneReleaseState, reconciler: FramedSceneReconciler) {
  state.mounted = false
  state.superseded.add(reconciler)
  queueMicrotask(() => disposeAllIfUnmounted(state))
}

function disposeAllIfUnmounted(state: SceneReleaseState) {
  if (state.mounted) return
  for (const waiting of state.superseded) waiting.dispose()
  state.superseded.clear()
}

function attachScene(
  state: SceneReleaseState,
  reconciler: FramedSceneReconciler,
  scene: FramedScene,
): () => void {
  state.attached = true
  releaseReplaced(state, reconciler, scene)
  return () => {
    state.attached = false
  }
}

interface ReconcilerLifetime {
  reconciler: FramedSceneReconciler
  releaseState: RefObject<SceneReleaseState>
}

/**
 * One reconciler per overlay setting; it reuses an unchanged floor's built scene instead of
 * rebuilding on every edit (foundation spec 5.5). Flipping the edge overlay constructs a fresh
 * reconciler, since every cached sub-group baked the previous setting in. Nothing is freed
 * during render: the flipped-away reconciler waits in the release state until useSceneRelease
 * frees it. On unmount the live reconciler and every waiting one are disposed a microtask later,
 * and a StrictMode remount, which runs the effect again at once, cancels that disposal. Activity
 * hiding counts as an unmount here; see useFramedScene.
 */
function useFramedSceneReconciler(edgeOverlay: boolean): ReconcilerLifetime {
  const reconciler = useMemo(() => createFramedSceneReconciler({ edgeOverlay }), [edgeOverlay])
  const releaseState = useRef<SceneReleaseState>({
    superseded: new Set(),
    attached: false,
    mounted: false,
  })
  useEffect(() => {
    const state = releaseState.current
    adoptReconciler(state, reconciler)
    return () => retireReconciler(state, reconciler)
  }, [reconciler])
  return { reconciler, releaseState }
}

/**
 * Frees what the reconcile replaced once it is no longer drawn. While no scene is attached (the
 * renderer is loading, starting, or could not start, or the hook runs without a Canvas), nothing
 * draws, so the effect frees after its own commit. While one is attached, the release waits for
 * onSceneAttached, which the renderer's React root calls in the commit that swaps the scene root.
 */
function useSceneRelease(
  { reconciler, releaseState }: ReconcilerLifetime,
  framed: FramedScene,
): (scene: FramedScene) => () => void {
  useEffect(() => {
    const state = releaseState.current
    if (!state.attached) releaseReplaced(state, reconciler, framed)
  }, [reconciler, releaseState, framed])
  return useCallback(
    (scene: FramedScene) => attachScene(releaseState.current, reconciler, scene),
    [reconciler, releaseState],
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
  /** Load status of the ground grass texture; the ground draws flat until it is 'ready'. */
  groundTexture: TextureStatus
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
 *
 * Not safe under Activity hiding: a hidden subtree runs the effect cleanup with no setup, so the
 * live reconciler is disposed while its scene can still be shown again. Unmount the view
 * instead of hiding it.
 */
export function useFramedScene(): FramedSceneState {
  const { graph, buildingView } = useShownSceneGraph()
  const paint = useProjectPaint()
  const { edgeOverlay, toggleEdgeOverlay } = useEdgeOverlay()
  const lifetime = useFramedSceneReconciler(edgeOverlay)
  const { reconciler } = lifetime
  const models = useFurnitureModelCache(graph)
  const texture = useGroundTexture(GROUND_GRASS_REFERENCE, useAssetRegistry())
  const framed = useMemo(() => {
    // Set before reconcile so the scene it returns, even from a new reconciler after an
    // overlay flip, draws with it.
    reconciler.setGroundAppearance(texture.appearance)
    return reconciler.reconcile(graph, paint, models.lookup)
  }, [reconciler, graph, paint, models, texture.appearance])
  const onSceneAttached = useSceneRelease(lifetime, framed)
  return {
    graph,
    buildingView,
    edgeOverlay,
    toggleEdgeOverlay,
    framed,
    modelsVersion: models.version,
    groundTexture: texture.status,
    onSceneAttached,
  }
}
