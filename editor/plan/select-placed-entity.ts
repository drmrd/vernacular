import type { SelectionStore } from '../../bridge'

/**
 * Selection is bridge-owned and outside undo history (ADR-0020); selecting a
 * just-placed entity here, rather than through the command, shows it in the
 * inspector without adding an undo step or disarming the placement tool.
 */
export function selectPlacedEntity(selection: SelectionStore, prefix: string, id: string): void {
  selection.select(`${prefix}${id}`)
}
