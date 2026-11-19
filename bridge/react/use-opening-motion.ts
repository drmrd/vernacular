/**
 * The motion of the 3D view's doors and windows: the open set they follow, the pose they take
 * on each newly built scene root, and the per-frame tick that swings them toward that set. It
 * runs in both camera modes, so a change made outside a walk still reaches the live scene.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { sceneGraphForFloor, type OpeningInteractionState, type OpeningSceneNode } from '../../core'
import type { SceneRoot } from '../../engine'
import { useActiveFloorId } from './active-floor-context'
import { useSceneGraph } from './use-scene-graph'
import { useShownSceneGraph } from './use-view-scene-graph'
import { followStoredOpenings, restoreOpenings, tickOpenings } from './walk-interaction'

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
   * floor's in the whole-building view. The per-frame tick reads these.
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
  return useShownSceneGraph().openings
}

// Holds the opening refs. The open/closed state follows the doors the session store holds
// open, copied so the walk keys never reach back into the store's set (ADR-0170). It takes
// the store's set whenever that set changes, so a reset made in orbit mode reaches the live
// scene. The walk keys report their own changes to the store, and following a set with the
// same doors keeps the same state, so that echo changes nothing.
function useFollowedOpenings(storedOpenDoorIds: ReadonlySet<string>): OpeningMotionRefs {
  const openings = useActiveFloorOpenings()
  const openingsRef = useRef<OpeningSceneNode[]>(openings)
  openingsRef.current = openings
  const shownOpenings = useShownOpenings()
  const shownOpeningsRef = useRef<OpeningSceneNode[]>(shownOpenings)
  shownOpeningsRef.current = shownOpenings
  const interactionRef = useRef<OpeningInteractionState>({ openIds: new Set(storedOpenDoorIds) })
  const opennessRef = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    interactionRef.current = followStoredOpenings(interactionRef.current, storedOpenDoorIds)
  }, [storedOpenDoorIds])
  return {
    openings: openingsRef,
    shownOpenings: shownOpeningsRef,
    interaction: interactionRef,
    openness: opennessRef,
  }
}

// Poses the openings on every newly built scene root where the session left them, in orbit
// mode as well as walk mode, so a rebuilt scene never shows a door shut that the session
// holds open. The ref objects never change, so only a new root re-runs this; their current
// values are read as it arrives.
function useRestoreOpeningsOnNewRoot(root: SceneRoot, refs: OpeningMotionRefs): void {
  const { openings, interaction, openness } = refs
  useEffect(() => {
    restoreOpenings({
      root,
      openings: openings.current,
      interaction: interaction.current,
      openness: openness.current,
    })
  }, [root, openings, interaction, openness])
}

/**
 * Owns the motion of the 3D view's doors and windows: they follow the doors the session store
 * holds open, and each newly built scene root is posed where the session left them. The follow
 * effect is declared before the root effect, so a root that arrives in the same render as a new
 * open set reads that set. The caller swings the openings each frame with tickOpeningMotion.
 */
export function useOpeningMotion(
  root: SceneRoot,
  storedOpenDoorIds: ReadonlySet<string>,
): OpeningMotionRefs {
  const refs = useFollowedOpenings(storedOpenDoorIds)
  useRestoreOpeningsOnNewRoot(root, refs)
  return refs
}

/**
 * Swings every opening one frame toward the open set, in either camera mode. An opening at
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
