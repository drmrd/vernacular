import { useCallback, useMemo, useSyncExternalStore } from 'react'

import type { SceneGraph } from '../../core'

import { useActiveFloorId } from './active-floor-context'
import type { FramedScene } from './framed-scene'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
import { useSceneSessionStoreOrLocal } from './scene-session-context'
import { useBuildingViewState, type BuildingViewState } from './use-building-view-state'
import { useFurnitureModelCache } from './use-furniture-model-cache'
import { useProjectPaint } from './use-project-paint'
import { useSceneGraph } from './use-scene-graph'
import { useViewSceneGraph } from './use-view-scene-graph'

/**
 * Per-view surface-edge overlay session state, never in the model or undo. The setting lives in
 * the scene session store, so it survives the preview subtree's unmount when the view mode
 * changes (ADR-0170). Off by default in Orbit (ADR-0132); it feeds the toolbar toggle and the
 * reconciler's view options.
 */
export function useEdgeOverlay(): { edgeOverlay: boolean; toggleEdgeOverlay: () => void } {
  const store = useSceneSessionStoreOrLocal()
  const session = useSyncExternalStore(store.subscribe, store.getSceneSession)
  // The toggle reads the field back out of the store as it fires, because the store, not a
  // rendered snapshot, is what holds the current value.
  const toggleEdgeOverlay = useCallback(
    () => store.updateSceneSession({ edgeOverlay: !store.getSceneSession().edgeOverlay }),
    [store],
  )
  return { edgeOverlay: session.edgeOverlay, toggleEdgeOverlay }
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
  const rawGraph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  const buildingView = useBuildingViewState()
  // Scope to the active floor or the whole building stacked at its elevations (issue
  // #206); the scoped graph is memoized so the scene rebuilds only when it changes.
  const graph = useViewSceneGraph(rawGraph, activeFloorId, buildingView)
  const paint = useProjectPaint()
  const { edgeOverlay, toggleEdgeOverlay } = useEdgeOverlay()
  // One reconciler per overlay setting; it reuses an unchanged floor's built scene
  // instead of rebuilding on every edit (foundation spec 5.5). Flipping the edge
  // overlay constructs a fresh reconciler, since every cached sub-group baked the
  // previous setting in.
  const reconciler = useMemo(() => createFramedSceneReconciler({ edgeOverlay }), [edgeOverlay])
  const models = useFurnitureModelCache(graph)
  const framed = useMemo(
    () => reconciler.reconcile(graph, paint, models.lookup),
    [reconciler, graph, paint, models],
  )
  return {
    graph,
    buildingView,
    edgeOverlay,
    toggleEdgeOverlay,
    framed,
    modelsVersion: models.version,
  }
}
