import * as THREE from 'three'

import { FLOOR_NODE_PREFIX, GROUND_PICK_TIE_MM, type SurfaceRef } from '../../core'

import { entityIdOf } from './entity-id'
import { isFadedForPicking } from './faded-for-picking'
import { isGroundPlane } from './ground-plane'
import { surfaceTableOf } from './wall-surface-table'

/** What one 3D click hits: the entity to select and the surface to paint, from the same hit. */
export interface ScenePick {
  entityId: string | null
  surface: SurfaceRef | null
}

export interface ScenePickAt {
  raycaster: THREE.Raycaster
  camera: THREE.Camera
  root: THREE.Object3D
  /** The pointer position in normalized device coordinates (each axis in [-1, 1]). */
  ndc: { x: number; y: number }
}

const NOTHING_PICKED: ScenePick = { entityId: null, surface: null }

/**
 * The hit that decides the pick among the hits that are not faded, nearest first. The
 * ground decides unless the next hit lies within GROUND_PICK_TIE_MM behind it, so a
 * floor slab coplanar with the lawn wins.
 */
function decidingHit(hits: THREE.Intersection[]): THREE.Intersection | undefined {
  const [nearest, next] = hits
  const groundTies =
    nearest !== undefined &&
    isGroundPlane(nearest.object) &&
    next !== undefined &&
    next.distance - nearest.distance <= GROUND_PICK_TIE_MM
  return groundTies ? next : nearest
}

/**
 * The surface ref carried on an object or its nearest ancestor (ADR-0056: a paintable
 * surface mesh carries `userData.surface`), or null when none does. A wall is not found
 * this way; it carries a table of surface refs by material group and is resolved from the
 * triangle hit.
 */
function surfaceRefOf(object: THREE.Object3D): SurfaceRef | null {
  let current: THREE.Object3D | null = object
  while (current !== null) {
    const surface = current.userData.surface
    if (surface !== undefined && surface !== null) {
      return surface as SurfaceRef
    }
    current = current.parent
  }
  return null
}

/**
 * The surface one hit gives: a wall mesh reads its surface table by the material group of
 * the triangle hit (null for a cap, end, or reveal); any other object reads the nearest
 * `userData.surface` on it or an ancestor.
 */
function surfaceOfHit(hit: THREE.Intersection): SurfaceRef | null {
  const table = surfaceTableOf(hit.object)
  if (table === undefined) {
    return surfaceRefOf(hit.object)
  }
  // `hit.face` is null for a line or point hit, which has no material group.
  const materialIndex = hit.face?.materialIndex
  return materialIndex === undefined ? null : (table[materialIndex] ?? null)
}

/** The entity id one hit selects; a level id (an unowned mesh under a floor group) gives null. */
function entityIdOfHit(hit: THREE.Intersection): string | null {
  const id = entityIdOf(hit.object)
  return id?.startsWith(FLOOR_NODE_PREFIX) === true ? null : id
}

/** Whether a hit on this object can decide a pick: not a drawing-aid line, not faded out. */
function isPickable(object: THREE.Object3D): boolean {
  return !(object instanceof THREE.Line) && !isFadedForPicking(object)
}

/**
 * The nearest hit on an object that is not faded decides both fields. The user sees
 * through a faded wall (and what fades with it), so the click is for what is behind it.
 * An edge-overlay or selection-outline line is a drawing aid, not a surface, so a click
 * passes through it.
 */
export function pickScene(raycaster: THREE.Raycaster, root: THREE.Object3D): ScenePick {
  const hits = raycaster.intersectObject(root, true).filter((each) => isPickable(each.object))
  const hit = decidingHit(hits)
  if (hit === undefined) {
    return NOTHING_PICKED
  }
  return { entityId: entityIdOfHit(hit), surface: surfaceOfHit(hit) }
}

/** Sets the raycaster from a camera and a normalized-device-coordinate point, then picks. */
export function pickSceneAt({ raycaster, camera, root, ndc }: ScenePickAt): ScenePick {
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera)
  return pickScene(raycaster, root)
}
