import type { DataRemovingRepair } from './data-removing-repair'
import { offerFromRepairs } from './find-repair-offer'
import type { RepairOffer } from './find-repair-offer'
import { mixedPaintEntry } from './mixed-paint-entry'
import { undefinedFields } from './undefined-fields'

export type { DataRemovingRepair } from './data-removing-repair'
export type { RepairOffer } from './find-repair-offer'

/** In this order: mixed-paint-entry, undefined-fields. */
export const DATA_REMOVING_REPAIRS: readonly DataRemovingRepair[] = [
  mixedPaintEntry,
  undefinedFields,
]

/** The offer of the data-removing repairs for a document that fails the format check, if any. */
export function findRepairOffer(document: unknown): RepairOffer | undefined {
  return offerFromRepairs(document, DATA_REMOVING_REPAIRS)
}
