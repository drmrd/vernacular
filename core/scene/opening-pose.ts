import { openingParts, type OpeningPartId } from './opening-motion'
import { advanceOpenness } from './opening-openness'

/** How far each part of one opening stands open: 0 is shut and 1 is the full travel. */
export type OpeningPose = Readonly<Partial<Record<OpeningPartId, number>>>

// When both sashes of a hung window are open they share the rise, so each travels half of it.
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
  const parts = openingParts(type)
  // Open parts the type lacks are ignored, so a stale part cannot change the target.
  const openOfType = new Set(parts.filter((part) => open?.has(part)))
  return Object.fromEntries(parts.map((part) => [part, openingPartTarget(openOfType, part)]))
}

/**
 * Eases every part named in the target toward its own openness. A part missing from the
 * current pose counts as shut. Returns `current` itself when no part moves.
 */
export function advanceOpeningPose(
  current: OpeningPose,
  target: OpeningPose,
  dtSeconds: number,
): OpeningPose {
  let advanced: Partial<Record<OpeningPartId, number>> | undefined
  for (const [part, goal] of Object.entries(target) as [OpeningPartId, number][]) {
    const before = current[part] ?? 0
    const after = advanceOpenness(before, goal, dtSeconds)
    if (after !== before) {
      advanced ??= { ...current }
      advanced[part] = after
    }
  }
  return advanced ?? current
}

/**
 * Jumps every part named in the pose or in the open set straight to its target openness.
 * An unshown opening has no type here, so a stale part in the open set can reach this pose;
 * the next tick that shows the opening eases it to the pose filtered by its type.
 */
export function settledPose(
  pose: OpeningPose,
  open: ReadonlySet<OpeningPartId> | undefined,
): OpeningPose {
  const parts = new Set([...(Object.keys(pose) as OpeningPartId[]), ...(open ?? [])])
  return Object.fromEntries([...parts].map((part) => [part, openingPartTarget(open, part)]))
}
