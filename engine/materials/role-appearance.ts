import * as THREE from 'three'

import type { SurfaceRole } from './material-provider'

/** A light warm gray shared by every wall and room surface role until painting assigns colors. */
export const NEUTRAL_COLOR = 0xd8d4cc
/** A door leaf reads slightly darker than the wall so it is legible set into the opening. */
export const LEAF_COLOR = 0xb9b0a2
/** A faint blue-gray so the glass reads as glazing. */
export const GLASS_COLOR = 0xbcd2da
/** Low enough that the room reads through the window. */
export const GLASS_OPACITY = 0.3
/** A clear, saturated red so an unloaded-asset massing box reads as a placeholder, not a real surface. */
export const FURNITURE_COLOR = 0xcc3333
/** Low enough that the placeholder box reads as a translucent stand-in. */
export const FURNITURE_OPACITY = 0.3
/** A desaturated cool gray so a failed-load massing box reads as inert, distinct from the unloaded red. */
export const FURNITURE_FAILED_COLOR = 0x6a6a6a
/** A touch more opaque than the unloaded box, reinforcing that this is the final state, not in-flight. */
export const FURNITURE_FAILED_OPACITY = 0.45
/**
 * The slab top and the wall base share the Y = 0 finished-floor datum and overlap in plan under
 * every wall (ADR-0076), so the two coplanar faces z-fight on camera orbit. Push the slab top back
 * in depth with a positive polygon offset so the coincident wall base wins the depth contest
 * deterministically, leaving the spec datum and all geometry untouched.
 */
export const SLAB_TOP_DEPTH_BIAS = { factor: 1, units: 1 } as const

/**
 * The polygon-offset fields that push the slab top back in depth (see SLAB_TOP_DEPTH_BIAS). Both
 * the neutral 'top' role and the painted floor branch source the bias from here so the convention
 * lives in one place rather than diverging per material path.
 */
export function slabTopDepthBiasParameters(): THREE.MeshStandardMaterialParameters {
  return {
    polygonOffset: true,
    polygonOffsetFactor: SLAB_TOP_DEPTH_BIAS.factor,
    polygonOffsetUnits: SLAB_TOP_DEPTH_BIAS.units,
  }
}

/**
 * The standard-material parameters for a surface role. Glass is transparent and writes no depth so
 * it blends without occluding the room behind it; the fill parts are thin boxes whose face
 * orientation depends on the opening normal sign, so leaf and glass render double-sided rather than
 * pinning a per-opening winding.
 */
export function roleMaterialParameters(role: SurfaceRole): THREE.MeshStandardMaterialParameters {
  if (role === 'glass') {
    return {
      color: GLASS_COLOR,
      name: role,
      transparent: true,
      opacity: GLASS_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    }
  }
  if (role === 'furniture') {
    return {
      color: FURNITURE_COLOR,
      name: role,
      transparent: true,
      opacity: FURNITURE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    }
  }
  if (role === 'furnitureFailed') {
    return {
      color: FURNITURE_FAILED_COLOR,
      name: role,
      transparent: true,
      opacity: FURNITURE_FAILED_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    }
  }
  if (role === 'leaf') {
    return { color: LEAF_COLOR, name: role, side: THREE.DoubleSide }
  }
  if (role === 'top') {
    return {
      color: NEUTRAL_COLOR,
      name: role,
      ...slabTopDepthBiasParameters(),
    }
  }
  return { color: NEUTRAL_COLOR, name: role }
}
