import { toggleOpenPart, type OpenParts, type OpeningPartRef } from './open-parts'

/**
 * Which parts of which openings the walker has pushed open, held as walk-session view-state.
 * This lives beside the camera state, never in the persisted project: opening a
 * door during a walk-through is a transient view, not an edit to the building.
 */
export interface OpeningInteractionState {
  /** The open parts of each opening, keyed by opening id; every other part is shut. */
  readonly openParts: OpenParts
}

/** A fresh interaction state with every opening closed. */
export function emptyOpeningInteraction(): OpeningInteractionState {
  return { openParts: new Map() }
}

/** Whether the opening with the given id has any part open. */
export function isOpeningOpen(state: OpeningInteractionState, id: string): boolean {
  return state.openParts.has(id)
}

/**
 * Toggles the referenced part of an opening between open and closed, returning a new
 * state and never mutating the input (matching the immutable walk state).
 */
export function toggleOpening(
  state: OpeningInteractionState,
  ref: OpeningPartRef,
): OpeningInteractionState {
  return { openParts: toggleOpenPart(state.openParts, ref) }
}
