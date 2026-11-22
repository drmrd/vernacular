import type { OpeningPartId } from './opening-motion'
import { openingParts } from './opening-motion'

/** How far each part of one opening stands open: 0 is shut and 1 is the full travel. */
export type OpeningPose = Readonly<Partial<Record<OpeningPartId, number>>>

// Both sashes of a hung window open share the rise, so each travels half of it.
const SHARED_SASH_TRAVEL = 0.5

/** The openness one part aims for, given the parts of its opening that are open. */
export function openingPartTarget(
  open: ReadonlySet<OpeningPartId> | undefined,
  part: OpeningPartId,
): number {
  if (!open?.has(part)) {
    return 0
  }
  return open.has('lower') && open.has('upper') ? SHARED_SASH_TRAVEL : 1
}

/** The openness every part of an opening type aims for. */
export function openingTargetPose(
  type: string,
  open: ReadonlySet<OpeningPartId> | undefined,
): OpeningPose {
  return Object.fromEntries(openingParts(type).map((part) => [part, openingPartTarget(open, part)]))
}
