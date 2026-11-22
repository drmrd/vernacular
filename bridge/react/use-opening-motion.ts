/**
 * The motion of the 3D view's doors and windows: the open parts they follow, the pose they take
 * on each newly built scene root or newly shown list, and the per-frame tick that swings them
 * toward those parts. It runs in both camera modes, so a change made outside a walk still reaches
 * the live scene.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  sceneGraphForFloor,
  type OpenParts,
  type OpeningInteractionState,
  type OpeningSceneNode,
} from '../../core'
import type { SceneRoot } from '../../engine'
import { useActiveFloorId } from './active-floor-context'
import { useSceneGraph } from './use-scene-graph'
import { useShownSceneGraph } from './use-view-scene-graph'
import {
  followStoredOpenings,
  restoreOpenings,
  settleUnshownOpenings,
  tickOpenings,
} from './walk-interaction'

/**
 * The refs the interact key, the frame loop, and a newly built root read: the live openings
 * (kept current for the keydown closure), the openings the view shows, the open/closed
 * view-state, and each opening's in-flight openness. They are view-state, never persisted edits.
 */
export interface OpeningMotionRefs {
  /** The active floor's openings: the candidates of the interact key, kept current for the keydown closure. */
  openings: RefObject<OpeningSceneNode[]>
  /**
   * Every opening the 3D view shows: the active floor's in the floor view, and every visible
   * floor's in the whole-building view. The per-frame tick reads these, and so does the pose of
   * a new root or of a new shown list.
   */
  shownOpenings: RefObject<OpeningSceneNode[]>
  interaction: RefObject<OpeningInteractionState>
  openness: RefObject<Map<string, number>>
}

// The openings on the active floor, the candidates an interact ray can land on.
// It rebuilds only when the scene graph or active floor changes.
function useActiveFloorOpenings(): OpeningSceneNode[] {
  const rawGraph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  return useMemo(
    () => sceneGraphForFloor(rawGraph, activeFloorId).openings,
    [rawGraph, activeFloorId],
  )
}

// Every opening the 3D view shows, derived from the same inputs the framed scene uses for the
// graph it builds, so the list always matches the root: the active floor's openings in the floor
// view, and every visible floor's openings in the whole-building view.
function useShownOpenings(): OpeningSceneNode[] {
  return useShownSceneGraph().graph.openings
}

// Owns the opening refs and returns them. The open/closed state follows the doors the session
// store holds open, copied so the walk keys never reach back into the store's map (ADR-0170). It takes
// the store's map whenever that map changes, so a reset made in orbit mode reaches the live
// scene. The walk keys report their own changes to the store, and following a map with the
// same doors keeps the same state, so that echo changes nothing. Each change of the map also
// seats the openings the view does not show at their new target, because no tick reaches them:
// the R key in a walk resets the state before the store echoes it, so the settle must not wait
// for the state to differ.
function useOpeningMotionRefs(
  storedOpenDoorIds: OpenParts,
  shownOpenings: OpeningSceneNode[],
): OpeningMotionRefs {
  const openings = useActiveFloorOpenings()
  const openingsRef = useRef<OpeningSceneNode[]>(openings)
  openingsRef.current = openings
  const shownOpeningsRef = useRef<OpeningSceneNode[]>(shownOpenings)
  shownOpeningsRef.current = shownOpenings
  const interactionRef = useRef<OpeningInteractionState>({ openParts: new Map(storedOpenDoorIds) })
  const opennessRef = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    interactionRef.current = followStoredOpenings(interactionRef.current, storedOpenDoorIds)
    settleUnshownOpenings({
      openings: shownOpeningsRef.current,
      interaction: interactionRef.current,
      openness: opennessRef.current,
    })
  }, [storedOpenDoorIds])
  return {
    openings: openingsRef,
    shownOpenings: shownOpeningsRef,
    interaction: interactionRef,
    openness: opennessRef,
  }
}

// Poses the shown openings where the session left them on every newly built scene root, and on
// every change of the shown list, in orbit mode as well as walk mode. A rebuilt scene never shows
// a door shut that the session holds open, and a reused root that comes back to view (the same
// root object after a return to its floor) is posed at the openness settled while it was away.
// It first settles every opening the new list does not show, because no tick reaches those: an
// opening that left the view part way through its swing is seated at its target and shows there,
// with no swing, when it returns. A shown opening keeps its openness, so the tick still swings it.
// The ref objects never change, so only a new root or a new shown list re-runs this; the state
// and openness refs are read as it arrives.
function useRestoreOpenings(
  root: SceneRoot,
  shownOpenings: OpeningSceneNode[],
  refs: OpeningMotionRefs,
): void {
  const { interaction, openness } = refs
  useEffect(() => {
    settleUnshownOpenings({
      openings: shownOpenings,
      interaction: interaction.current,
      openness: openness.current,
    })
    restoreOpenings({
      root,
      openings: shownOpenings,
      interaction: interaction.current,
      openness: openness.current,
    })
  }, [root, shownOpenings, interaction, openness])
}

/**
 * Owns the motion of the 3D view's doors and windows: they follow the doors the session store
 * holds open, and each newly built scene root or newly shown list is posed where the session left
 * them. The follow effect is declared before the pose effect, so a root that arrives in the same
 * render as a new open-parts map reads that map, and a return to a floor reads the settled openness.
 * The caller swings the openings each frame with tickOpeningMotion.
 */
export function useOpeningMotion(root: SceneRoot, storedOpenDoorIds: OpenParts): OpeningMotionRefs {
  const shownOpenings = useShownOpenings()
  const refs = useOpeningMotionRefs(storedOpenDoorIds, shownOpenings)
  useRestoreOpenings(root, shownOpenings, refs)
  return refs
}

/**
 * Swings every opening one frame toward the open parts, in either camera mode. An opening at
 * rest on its target costs two lookups (its open state and its openness).
 */
export function tickOpeningMotion(root: SceneRoot, refs: OpeningMotionRefs, delta: number): void {
  tickOpenings(
    {
      root,
      openings: refs.shownOpenings.current,
      interaction: refs.interaction.current,
      openness: refs.openness.current,
    },
    delta,
  )
}
