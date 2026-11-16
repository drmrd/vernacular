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

/**
 * The surface ref of one ray hit. An object that carries a surface table (a wall
 * mesh) resolves through the material group of the triangle hit, so a long face
 * yields its side's ref and a cap, end, or reveal yields null; any other object
 * falls back to {@link surfaceRefOf}.
 */
function surfaceRefOfHit(hit: THREE.Intersection): SurfaceRef | null {
  const table = surfaceTableOf(hit.object)
  if (table === undefined) return surfaceRefOf(hit.object)
  const materialIndex = hit.face?.materialIndex
  if (materialIndex === undefined) return null
  return table[materialIndex] ?? null
}

/** The surface ref of the nearest object a ray strikes, or null when the ray hits no surface. */
export function pickSurface(raycaster: THREE.Raycaster, root: THREE.Object3D): SurfaceRef | null {
  for (const hit of raycaster.intersectObject(root, true)) {
    const surface = surfaceRefOfHit(hit)
    if (surface !== null) {
      return surface
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
