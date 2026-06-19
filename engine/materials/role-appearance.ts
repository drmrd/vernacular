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
/**
 * The slab top and the wall base share the Y = 0 finished-floor datum and overlap in plan under
 * every wall (ADR-0076), so the two coplanar faces z-fight on camera orbit. Push the slab top back
 * in depth with a positive polygon offset so the coincident wall base wins the depth contest
 * deterministically, leaving the spec datum and all geometry untouched.
 */
export const SLAB_TOP_DEPTH_BIAS = { factor: 1, units: 1 } as const

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
  if (role === 'leaf') {
    return { color: LEAF_COLOR, name: role, side: THREE.DoubleSide }
  }
  if (role === 'top') {
    return {
      color: NEUTRAL_COLOR,
      name: role,
      polygonOffset: true,
      polygonOffsetFactor: SLAB_TOP_DEPTH_BIAS.factor,
      polygonOffsetUnits: SLAB_TOP_DEPTH_BIAS.units,
    }
  }
  return { color: NEUTRAL_COLOR, name: role }
}
