/**
 * Which openings the walker has pushed open, held as walk-session view-state.
 * This lives beside the camera state, never in the persisted project: opening a
 * door during a walk-through is a transient view, not an edit to the building.
 */
export interface OpeningInteractionState {
  /** The ids of the openings that are currently open; every other opening is closed. */
  readonly openIds: ReadonlySet<string>
}

/** A fresh interaction state with every opening closed. */
export function emptyOpeningInteraction(): OpeningInteractionState {
  return { openIds: new Set() }
}

/** Whether the opening with the given id is currently open. */
export function isOpeningOpen(state: OpeningInteractionState, id: string): boolean {
  return state.openIds.has(id)
}

/**
 * Toggles the opening with the given id between open and closed, returning a new
 * state and never mutating the input (matching the immutable walk state).
 */
export function toggleOpening(state: OpeningInteractionState, id: string): OpeningInteractionState {
  const openIds = new Set(state.openIds)
  if (openIds.has(id)) {
    openIds.delete(id)
  } else {
    openIds.add(id)
  }
  return { openIds }
}
