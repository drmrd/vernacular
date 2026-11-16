import * as THREE from 'three'

import type { SurfaceRef } from '../../core'

import { surfaceTableOf } from './wall-surface-table'

/**
 * The surface ref carried on a renderable object or the nearest ancestor that has one
 * (ADR-0056: a paintable surface mesh carries `userData.surface`). A hit on the floor
 * slab resolves to that floor's SurfaceRef, the same ref the 2D plan paints. Returns
 * null when no ancestor carries a surface ref.
 */
export function surfaceRefOf(object: THREE.Object3D): SurfaceRef | null {
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

/** What one ray hit settles: the surface picked (null for none), or undefined to go on. */
type HitDecision = { surface: SurfaceRef | null } | undefined

/**
 * Decides what one ray hit means for the pick. An object that carries a surface table
 * (a wall mesh) always decides: the material group of the triangle hit yields its side's
 * ref for a long face and null for a cap, end, or reveal. Any other object decides only
 * when it carries a surface ref ({@link surfaceRefOf}); otherwise the ray goes on.
 */
function decideHit(hit: THREE.Intersection): HitDecision {
  const table = surfaceTableOf(hit.object)
  if (table === undefined) {
    const surface = surfaceRefOf(hit.object)
    return surface === null ? undefined : { surface }
  }
  // `hit.face` is null for a line or point hit, which has no material group; returning
  // no surface there cannot credit the hit to the wrong surface.
  const materialIndex = hit.face?.materialIndex
  const wallSurface = materialIndex === undefined ? null : (table[materialIndex] ?? null)
  return { surface: wallSurface }
}

/**
 * The surface ref a ray picks, or null when it picks none. The hits are read nearest
 * first. A wall decides at its first hit: a paintable long face gives that face and its
 * side, a cap, an end, or a reveal gives no surface, and nothing behind the wall is
 * returned. Another object decides only when it carries a surface (a floor slab); an
 * object with no surface is skipped.
 */
export function pickSurface(raycaster: THREE.Raycaster, root: THREE.Object3D): SurfaceRef | null {
  for (const hit of raycaster.intersectObject(root, true)) {
    const decision = decideHit(hit)
    // A wall is opaque: a surface behind a wall hit that has no paintable surface (a cap,
    // an end, a reveal) is not what the user clicked, so the ray stops at that hit.
    if (decision !== undefined) {
      return decision.surface
    }
  }
  return null
}

export interface SurfacePickAt {
  raycaster: THREE.Raycaster
  camera: THREE.Camera
  root: THREE.Object3D
  /** The pointer position in normalized device coordinates (each axis in [-1, 1]). */
  ndc: { x: number; y: number }
}

/** Sets the raycaster from a camera and a normalized-device-coordinate point, then picks. */
export function pickSurfaceAt({ raycaster, camera, root, ndc }: SurfacePickAt): SurfaceRef | null {
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera)
  return pickSurface(raycaster, root)
}
