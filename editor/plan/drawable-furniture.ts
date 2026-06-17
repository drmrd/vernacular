import type { FurnitureInstance } from '../../core'
import type { DrawableFurniture } from './draw-furniture'

/**
 * Pair each furniture instance with whether the selection set contains its id.
 * Coverage path feeding `drawPlan`, mirroring `toDrawableOpenings`.
 */
export function toDrawableFurniture(
  furniture: readonly FurnitureInstance[],
  selectedIds: ReadonlySet<string>,
): DrawableFurniture[] {
  return furniture.map((instance) => ({
    instance,
    selected: selectedIds.has(instance.id),
  }))
}
