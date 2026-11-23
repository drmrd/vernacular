import {
  advanceOpeningPose,
  openingTargetPose,
  openingUnderReach,
  sameOpenParts,
  settledPose,
  toggleOpening,
  walkLookDirection,
  type OpeningInteractionState,
  type OpeningReachHit,
  type OpenParts,
  type OpeningPose,
  type OpeningSceneNode,
  type WalkState,
} from '../../core'
import { applyOpeningPose, type SceneRoot } from '../../engine'

/**
 * The "use" action: casts a short ray from the walker's eye and toggles the
 * part of the opening it lands on within reach (the sash under the aim for a hung window), returning the updated interaction state. With
 * nothing in reach the state is returned unchanged, so pressing the interact key
 * in open space is a no-op. The per-opening `openness` lets the ray test each leaf
 * at its open position, so looking at an opened door or a slid-back pocket door
 * closes it.
 */
// eslint-disable-next-line max-params -- a 4th input trips max-params whether bare or bundled, and unlike openingUnderReach (two optional extras) this function has a single optional extra (openness), so a bare parameter is clearer than a one-field options bag; this mirrors the four-param disable already on openingUnderReach.
export function interactFromWalk(
  walk: WalkState,
  openings: readonly OpeningSceneNode[],
  interaction: OpeningInteractionState,
  openness?: ReadonlyMap<string, OpeningPose>,
): OpeningInteractionState {
  const hit = reachFromWalk(walk, openings, openness)
  return hit === null ? interaction : toggleOpening(interaction, hit)
}

/**
 * The opening part the walker's eye reaches, or null: the one test both the interact key and the
 * aim guide use, so the outline always marks what the key acts on.
 */
export function reachFromWalk(
  walk: WalkState,
  openings: readonly OpeningSceneNode[],
  openness?: ReadonlyMap<string, OpeningPose>,
): OpeningReachHit | null {
  // exactOptionalPropertyTypes rejects `{ openness: undefined }` for openingUnderReach's
  // `openness?` field, so build options only when a map is present (a Map is always
  // truthy); omitting it leaves the field genuinely absent.
  const options = openness ? { openness } : undefined
  return openingUnderReach(walk.position, walkLookDirection(walk), openings, options)
}

/** The per-frame inputs that drive the opening motion animation. */
export interface OpeningTick {
  root: SceneRoot
  openings: readonly OpeningSceneNode[]
  interaction: OpeningInteractionState
  /** Each opening's live pose (each part 0 shut, 1 open), advanced in place each frame. */
  openness: Map<string, OpeningPose>
}

/**
 * Advances every opening one timestep: eases each part toward its target openness
 * and moves that part's meshes to match. An opening
 * already at rest on its target is skipped, so the motion runs only while a door
 * or window is in motion.
 */
export function tickOpenings(tick: OpeningTick, dtSeconds: number): void {
  for (const node of tick.openings) {
    const target = openingTargetPose(node.type, tick.interaction.openParts.get(node.id))
    const current = tick.openness.get(node.id) ?? openingTargetPose(node.type, undefined)
    const next = advanceOpeningPose(current, target, dtSeconds)
    if (next === current) continue
    tick.openness.set(node.id, next)
    applyOpeningPose(tick.root, node, next)
  }
}

/**
 * The interaction state that matches the doors the session store holds open: the given state
 * itself when it already holds exactly those doors, else a new state holding a copy of them, so
 * a reset made outside a walk reaches the live scene.
 */
export function followStoredOpenings(
  interaction: OpeningInteractionState,
  stored: OpenParts,
): OpeningInteractionState {
  return sameOpenParts(interaction.openParts, stored) ? interaction : { openParts: new Map(stored) }
}

/**
 * Seats at its target every opening that carries an openness but that the scene does not show,
 * because no tick reaches it: a later root that shows it is then posed at the session's state,
 * with no swing. An opening in `openings` keeps its openness, so the tick still swings it.
 */
export function settleUnshownOpenings(settle: Omit<OpeningTick, 'root'>): void {
  const shownIds = new Set(settle.openings.map((node) => node.id))
  for (const [id, pose] of settle.openness) {
    if (shownIds.has(id)) continue
    settle.openness.set(id, settledPose(pose, settle.interaction.openParts.get(id)))
  }
}

/**
 * Poses every opening on the given root where the session left it, so a newly built or rebuilt
 * root never shows a door out of place: an opening that carries an openness is posed at that
 * openness, an opening held open with none is seated at its target pose and recorded so, and every other
 * opening keeps its built pose.
 */
export function restoreOpenings(tick: OpeningTick): void {
  for (const node of tick.openings) {
    const carried = tick.openness.get(node.id)
    const open = tick.interaction.openParts.get(node.id)
    if (carried !== undefined) {
      applyOpeningPose(tick.root, node, carried)
    } else if (open !== undefined) {
      const pose = openingTargetPose(node.type, open)
      tick.openness.set(node.id, pose)
      applyOpeningPose(tick.root, node, pose)
    }
  }
}
