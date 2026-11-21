import type { DataRemovingRepair } from './data-removing-repair'
import { mixedPaintEntry } from './mixed-paint-entry'
import { undefinedFields } from './undefined-fields'

export type { DataRemovingRepair } from './data-removing-repair'

/** In this order: mixed-paint-entry, undefined-fields. */
export const DATA_REMOVING_REPAIRS: readonly DataRemovingRepair[] = [
  mixedPaintEntry,
  undefinedFields,
]
