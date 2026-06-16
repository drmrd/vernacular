import { pointInPolygon, type FurnitureInstance, type Point } from '../../core'
import { furnitureSymbol } from './draw-furniture'

/**
 * The id of the topmost placed furniture whose rotated footprint contains the
 * point, or null. Mirrors `hitTestOpenings`: forward iteration so a later
 * (drawn-on-top) item wins, with exact footprint containment and no tolerance band.
 */
export function hitTestFurniture(
  furniture: readonly FurnitureInstance[],
  point: Point,
): string | null {
  let hitId: string | null = null
  for (const instance of furniture) {
    // Iterate forward so a later (more recently placed) item wins on overlap.
    if (pointInPolygon(point, furnitureSymbol(instance).corners)) {
      hitId = instance.id
    }
  }
  return hitId
}
