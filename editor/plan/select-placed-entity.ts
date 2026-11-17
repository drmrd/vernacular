import type { SelectionStore } from '../../bridge'
import { OPENING_NODE_PREFIX, STAIR_NODE_PREFIX } from '../../core'

/**
 * Selection is bridge-owned and outside undo history (ADR-0020); selecting a
 * just-placed entity here, rather than through the command, shows it in the
 * inspector without adding an undo step or disarming the placement tool.
 *
 * `selectionId` is the id the selection's consumers match: the prefixed scene
 * node id for an opening or a stair, and the raw instance id for furniture,
 * which is what a click on the plan selects and what the inspector, the plan
 * highlight, and Delete look up.
 */
export function selectPlacedEntity(selection: SelectionStore, selectionId: string): void {
  selection.select(selectionId)
}

/** Select a just-placed opening under its prefixed scene node id. */
export function selectPlacedOpening(selection: SelectionStore, openingId: string): void {
  selectPlacedEntity(selection, `${OPENING_NODE_PREFIX}${openingId}`)
}

/** Select a just-placed stair under its prefixed scene node id. */
export function selectPlacedStair(selection: SelectionStore, stairId: string): void {
  selectPlacedEntity(selection, `${STAIR_NODE_PREFIX}${stairId}`)
}
