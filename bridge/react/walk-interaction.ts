import {
  advanceOpeningPose,
  openingTargetPose,
  openingUnderReach,
  sameOpenParts,
  settledPose,
  toggleOpening,
  walkLookDirection,
  type OpeningInteractionState,
  type OpenParts,
  type OpeningPose,
  type OpeningSceneNode,
  type WalkState,
} from '../../core'
import { applyOpeningPose, type SceneRoot } from '../../engine'

/**
 * The "use" action: casts a short ray from the walker's eye and toggles the
 * opening it lands on within reach, returning the updated interaction state. With
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
  // exactOptionalPropertyTypes rejects `{ openness: undefined }` for openingUnderReach's
  // `openness?` field, so build options only when a map is present (a Map is always
  // truthy); omitting it leaves the field genuinely absent.
  const options = openness ? { openness } : undefined
  const hit = openingUnderReach(walk.position, walkLookDirection(walk), openings, options)
  return hit === null ? interaction : toggleOpening(interaction, hit)
}

/** The per-frame inputs that drive the opening motion animation. */
export interface OpeningTick {
  root: SceneRoot
  openings: readonly OpeningSceneNode[]
  interaction: OpeningInteractionState
  /** Each opening's live pose (each part 0 shut, 1 open), advanced in place each frame. */
  openness: Map<string, OpeningPose>
}

function shutPoseOf(target: OpeningPose): OpeningPose {
  return Object.fromEntries(Object.keys(target).map((part) => [part, 0]))
}

/**
 * Advances every opening one timestep toward its open or closed target and moves
 * its fill group to match, playing the motion its type resolves to. An opening
 * already at rest on its target is skipped, so the motion runs only while a door
 * or window is in motion.
 */
export function tickOpenings(tick: OpeningTick, dtSeconds: number): void {
  for (const node of tick.openings) {
    const target = openingTargetPose(node.type, tick.interaction.openParts.get(node.id))
    const current = tick.openness.get(node.id) ?? shutPoseOf(target)
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
 * openness, an opening held open with none is seated fully open and recorded so, and every other
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
