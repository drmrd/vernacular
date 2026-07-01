import type { Point } from '../model/types'
import type { Vector3 } from './vector3'
import { worldToPlan } from './plan-to-world'
import { isInteriorViewpoint } from './interior-viewpoint'

/**
 * Reports whether the orbit camera lies outside the building footprint, which is
 * exactly when the near-wall transparency fade should engage: a viewer standing
 * outside the walls wants the nearest one to fade so the interior stays visible,
 * whereas a viewer already indoors should see solid walls. This works in world
 * coordinates because that is what the live camera provides; it projects the
 * camera down to the ground plane before testing containment. Points on a room
 * boundary count as inside, and an empty footprint reports outside.
 *
 * The `enabled` / view-mode guard lives in the bridge, not here, so this
 * predicate is intentionally flag-free. Composes {@link worldToPlan} and
 * {@link isInteriorViewpoint}.
 *
 * @param cameraWorld The orbit camera position, in Three.js world millimeters.
 * @param roomPolygons The floor's room outlines, in plan millimeters.
 */
export function cameraOutsideBuilding(
  cameraWorld: Vector3,
  roomPolygons: readonly (readonly Point[])[],
): boolean {
  return !isInteriorViewpoint(worldToPlan(cameraWorld), roomPolygons)
}
