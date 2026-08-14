import { metersToMillimeters, type LightingMode } from '../../core'

/** The r184 `GTAONode` tuning uniforms (see the slice spec's tuning caveat). */
export interface AmbientOcclusionParams {
  /** How far the horizon search reaches, in world millimeters. */
  readonly radius: number
  /** Exponent on the occlusion term; unitless. */
  readonly scale: number
  /** The view-space depth gap past which a sample stops counting as an occluder, in millimeters. */
  readonly thickness: number
  /** Exponent shaping how sample offsets grow along the march; unitless. */
  readonly distanceExponent: number
  /** Mix factor for the per-step falloff, in [0, 1]; unitless. */
  readonly distanceFallOff: number
  /** Samples per fragment; unitless. */
  readonly sampleCount: number
}

// `radius` and `thickness` are the two uniforms the r184 shader measures in view space: the
// first scales a unit view-space direction into each sample offset, the second is compared
// against a view-space depth delta to tell a nearby occluder from unrelated geometry behind it.
// Their addon defaults are written for the metre world three's examples use, so in this
// project's millimeter world (ADR-0027) they convert rather than retune. A quarter metre also
// sits at the low end of the quarter-to-half-metre gather interior rooms are conventionally
// occluded over. The remaining four uniforms are unitless and carry over unchanged.
const AO_RADIUS_METERS = 0.25
const AO_THICKNESS_METERS = 1
const AO_RADIUS = metersToMillimeters(AO_RADIUS_METERS)
const AO_THICKNESS = metersToMillimeters(AO_THICKNESS_METERS)
const AO_SCALE = 1
const AO_DISTANCE_EXPONENT = 1
const AO_DISTANCE_FALL_OFF = 1
const AO_SAMPLE_COUNT = 16

/**
 * The r184 `GTAONode` tuning defaults. The tuning surface is superseded in r185 (darker,
 * wider occlusion; red-channel-only render target) and r186 (`distanceExponent` and
 * `distanceFallOff` become no-ops), so these values hold only for the pinned r184 and are
 * re-tuned when three.js is next bumped.
 */
export const AO_DEFAULT_PARAMS: AmbientOcclusionParams = Object.freeze({
  radius: AO_RADIUS,
  scale: AO_SCALE,
  thickness: AO_THICKNESS,
  distanceExponent: AO_DISTANCE_EXPONENT,
  distanceFallOff: AO_DISTANCE_FALL_OFF,
  sampleCount: AO_SAMPLE_COUNT,
})

/** The AO tuning for a mode, or null when AO does not run (schematic). */
export function ambientOcclusionParamsFor(mode: LightingMode): AmbientOcclusionParams | null {
  return mode === 'realistic' ? AO_DEFAULT_PARAMS : null
}
