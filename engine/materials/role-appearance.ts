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
/** A warm amber so a still-loading massing box reads as in-flight, distinct from the unloaded red and the failed gray. */
export const FURNITURE_LOADING_COLOR = 0xddaa33
/** Matches the failed box's weight so the loading state reads as a deliberate appearance, not the translucent unloaded stand-in. */
export const FURNITURE_LOADING_OPACITY = 0.45
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
 * The ground plane and the finished-floor slab top both sit at the Y = 0 datum facing up and
 * overlap in plan under the whole footprint, so they z-fight. The ordering is layered: the slab
 * top is pushed back so the coincident wall base wins (SLAB_TOP_DEPTH_BIAS, ADR-0102), and the
 * ground plane is pushed back farther still, so the floor slab top wins over the lawn and the
 * finished floor draws over the grass where the two coplanar faces meet. Both fields stay strictly
 * greater than the slab top's so the ground plane always loses to the floor it sits beneath.
 */
export const GROUND_PLANE_DEPTH_BIAS = {
  factor: SLAB_TOP_DEPTH_BIAS.factor + 1,
  units: SLAB_TOP_DEPTH_BIAS.units + 1,
} as const

/**
 * The polygon-offset fields that push the ground plane back in depth (see GROUND_PLANE_DEPTH_BIAS),
 * mirroring slabTopDepthBiasParameters so the convention lives in one place rather than diverging
 * per material path.
 */
export function groundPlaneDepthBiasParameters(): THREE.MeshStandardMaterialParameters {
  return {
    polygonOffset: true,
    polygonOffsetFactor: GROUND_PLANE_DEPTH_BIAS.factor,
    polygonOffsetUnits: GROUND_PLANE_DEPTH_BIAS.units,
  }
}

/**
 * A furniture massing box rests its base cap on the Y = 0 datum, coplanar with the slab top and,
 * on grade, with the ground plane. The cap is transparent and writes no depth, so it never wins a
 * depth write; a positive polygon offset instead raises its tested depth so it loses the depth test
 * to whichever opaque surface it sits on. It is the last rung of the Y = 0 ladder, pushed one rung
 * past the ground plane so it loses to every opaque surface it can rest on (the unbiased wall base,
 * the slab top, and the ground plane). Both fields stay strictly greater than the ground plane's,
 * so the derivation keeps the whole ladder one strictly increasing sequence (ADR-0141).
 */
export const FURNITURE_BASE_DEPTH_BIAS = {
  factor: GROUND_PLANE_DEPTH_BIAS.factor + 1,
  units: GROUND_PLANE_DEPTH_BIAS.units + 1,
} as const

/**
 * The polygon-offset fields that push the furniture base cap back in depth (see
 * FURNITURE_BASE_DEPTH_BIAS), mirroring slabTopDepthBiasParameters so the convention lives in one
 * place. The furniture builder spreads these into the base-cap material alongside its state
 * appearance, so only the cap is biased and the box sides and top stay unbiased.
 */
export function furnitureBaseDepthBiasParameters(): THREE.MeshStandardMaterialParameters {
  return {
    polygonOffset: true,
    polygonOffsetFactor: FURNITURE_BASE_DEPTH_BIAS.factor,
    polygonOffsetUnits: FURNITURE_BASE_DEPTH_BIAS.units,
  }
}

/**
 * A window sash frame fills the opening flush with the wall reveal faces, so the two coplanar,
 * back-to-back faces z-fight. The sash frame is the finished element the viewer should see, so the
 * unbiased 'leaf' sash wins and the 'reveal' role is pushed back one rung. This is the last rung of
 * the ladder, derived from the furniture base plus one so the whole ladder stays one strictly
 * increasing sequence with a single source of truth. The reveal contest sits on its own plane
 * inside the wall thickness and never shares depth with the Y = 0 surfaces, so its absolute rung
 * only has to beat the unbiased sash leaf, which any positive rung does (ADR-0141).
 */
export const REVEAL_DEPTH_BIAS = {
  factor: FURNITURE_BASE_DEPTH_BIAS.factor + 1,
  units: FURNITURE_BASE_DEPTH_BIAS.units + 1,
} as const

/**
 * The polygon-offset fields that push the window reveal back in depth (see REVEAL_DEPTH_BIAS),
 * mirroring slabTopDepthBiasParameters so the convention lives in one place. The reveal role spreads
 * these into its material spec so only the reveal faces are biased and the flush sash leaf wins.
 */
export function revealDepthBiasParameters(): THREE.MeshStandardMaterialParameters {
  return {
    polygonOffset: true,
    polygonOffsetFactor: REVEAL_DEPTH_BIAS.factor,
    polygonOffsetUnits: REVEAL_DEPTH_BIAS.units,
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
  if (role === 'furnitureLoading') {
    return {
      color: FURNITURE_LOADING_COLOR,
      name: role,
      transparent: true,
      opacity: FURNITURE_LOADING_OPACITY,
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
  if (role === 'reveal') {
    return {
      color: NEUTRAL_COLOR,
      name: role,
      ...revealDepthBiasParameters(),
    }
  }
  return { color: NEUTRAL_COLOR, name: role }
}
