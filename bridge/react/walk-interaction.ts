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
 * in open space is a no-op.
 */
export function interactFromWalk(
  walk: WalkState,
  openings: readonly OpeningSceneNode[],
  interaction: OpeningInteractionState,
): OpeningInteractionState {
  const targetId = openingUnderReach(walk.position, walkLookDirection(walk), openings)
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
