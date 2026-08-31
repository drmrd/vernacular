import {
  advanceOpenness,
  isOpeningOpen,
  openingUnderReach,
  toggleOpening,
  walkLookDirection,
  type OpeningInteractionState,
  type OpeningSceneNode,
  type WalkState,
} from '../../core'
import { applyOpeningMotionForNode, type SceneRoot } from '../../engine'

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
  openness?: ReadonlyMap<string, number>,
): OpeningInteractionState {
  // exactOptionalPropertyTypes rejects `{ openness: undefined }` for openingUnderReach's
  // `openness?` field, so build options only when a map is present (a Map is always
  // truthy); omitting it leaves the field genuinely absent.
  const options = openness ? { openness } : undefined
  const targetId = openingUnderReach(walk.position, walkLookDirection(walk), openings, options)
  return targetId === null ? interaction : toggleOpening(interaction, targetId)
}

/** The per-frame inputs that drive the opening motion animation. */
export interface OpeningTick {
  root: SceneRoot
  openings: readonly OpeningSceneNode[]
  interaction: OpeningInteractionState
  /** Each opening's live openness (0 shut, 1 open), advanced in place each frame. */
  openness: Map<string, number>
}

// Openness targets, from the interaction state: 1 when the opening is held open.
const OPEN = 1
const SHUT = 0

/**
 * Advances every opening one timestep toward its open or closed target and moves
 * its fill group to match, playing the motion its type resolves to. An opening
 * already at rest on its target is skipped, so the motion runs only while a door
 * or window is in motion.
 */
export function tickOpenings(tick: OpeningTick, dtSeconds: number): void {
  for (const node of tick.openings) {
    const target = isOpeningOpen(tick.interaction, node.id) ? OPEN : SHUT
    const current = tick.openness.get(node.id) ?? SHUT
    if (current === target) continue
    const next = advanceOpenness(current, target, dtSeconds)
    tick.openness.set(node.id, next)
    applyOpeningMotionForNode(tick.root, node, next)
  }
}

/**
 * Seats every opening a saved session left open at its open pose, so a door restored from
 * a saved session appears open on the first frame instead of swinging from shut (ADR-0170).
 * An opening that already carries an openness is mid swing and is left to the per-frame
 * tick, and so is every opening the saved session did not hold open.
 */
export function restoreOpenings(tick: OpeningTick): void {
  for (const node of tick.openings) {
    if (!isOpeningOpen(tick.interaction, node.id)) continue
    if (tick.openness.has(node.id)) continue
    tick.openness.set(node.id, OPEN)
    applyOpeningMotionForNode(tick.root, node, OPEN)
  }
}
