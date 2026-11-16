import type { SelectionStore } from '../../bridge'

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
