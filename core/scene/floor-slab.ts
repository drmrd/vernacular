/** Placeholder thickness for a floor slab, in millimeters. A real floor
 *  thickness becomes a layered assembly later (finish floor over substrate over
 *  structure, sharing the construction-profile machinery of the ADR-0034 wall
 *  profiles). Until then this single flat value stands in, and
 *  `floorSlabThickness()` is the one read point that the future assembly will
 *  replace. */
export const DEFAULT_FLOOR_SLAB_THICKNESS_MM = 250

/** The single read point for a floor slab's thickness. It takes no argument
 *  today because no model entity carries a per-slab thickness yet; every slab
 *  uses the shared placeholder. */
export function floorSlabThickness(): number {
  return DEFAULT_FLOOR_SLAB_THICKNESS_MM
}
