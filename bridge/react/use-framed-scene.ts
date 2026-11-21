import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

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
 * One reconciler per overlay setting; it reuses an unchanged floor's built scene instead of
 * rebuilding on every edit (foundation spec 5.5). Flipping the edge overlay constructs a fresh
 * reconciler, since every cached sub-group baked the previous setting in. Nothing is freed
 * during render: once the new reconciler commits, the superseded one is disposed. On unmount
 * the live reconciler is disposed a microtask later, and a StrictMode remount, which runs the
 * effect again at once, cancels that disposal so the live scene stays intact.
 */
export function useOverlayReconciler(edgeOverlay: boolean): FramedSceneReconciler {
  const reconciler = useMemo(() => createFramedSceneReconciler({ edgeOverlay }), [edgeOverlay])
  const pendingDisposals = useRef(new Set<FramedSceneReconciler>())
  useEffect(() => {
    const pending = pendingDisposals.current
    for (const superseded of pending) {
      if (superseded !== reconciler) superseded.dispose()
    }
    pending.clear()
    return () => {
      pending.add(reconciler)
      queueMicrotask(() => {
        if (pending.delete(reconciler)) reconciler.dispose()
      })
    }
  }, [reconciler])
  return reconciler
}

/** The framed scene together with the session state that shapes it. */
export interface FramedSceneState {
  graph: SceneGraph
  buildingView: BuildingViewState
  edgeOverlay: boolean
  toggleEdgeOverlay: () => void
  framed: FramedScene
  modelsVersion: number
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
  const reconciler = useOverlayReconciler(edgeOverlay)
  const models = useFurnitureModelCache(graph)
  const framed = useMemo(
    () => reconciler.reconcile(graph, paint, models.lookup),
    [reconciler, graph, paint, models],
  )
  // What the reconcile replaced is freed only once the scene it returned has committed.
  useEffect(() => {
    reconciler.releaseRetired()
  }, [reconciler, framed])
  return {
    graph,
    buildingView,
    edgeOverlay,
    toggleEdgeOverlay,
    framed,
    modelsVersion: models.version,
  }
}
