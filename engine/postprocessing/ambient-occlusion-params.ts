import type { LightingMode } from '../../core'

/** The r184 `GTAONode` tuning uniforms (see the slice spec's tuning caveat). */
export interface AmbientOcclusionParams {
  radius: number
  scale: number
  thickness: number
  distanceExponent: number
  distanceFallOff: number
  sampleCount: number
}

const AO_RADIUS = 0.25
const AO_SCALE = 1
const AO_THICKNESS = 1
const AO_DISTANCE_EXPONENT = 1
const AO_DISTANCE_FALL_OFF = 1
const AO_SAMPLE_COUNT = 16

/**
 * The r184 `GTAONode` tuning defaults. The tuning surface is superseded in r185 (darker,
 * wider occlusion; red-channel-only render target) and r186 (`distanceExponent` and
 * `distanceFallOff` become no-ops), so these values hold only for the pinned r184 and are
 * re-tuned when three.js is next bumped.
 */
export const AO_DEFAULT_PARAMS: AmbientOcclusionParams = {
  radius: AO_RADIUS,
  scale: AO_SCALE,
  thickness: AO_THICKNESS,
  distanceExponent: AO_DISTANCE_EXPONENT,
  distanceFallOff: AO_DISTANCE_FALL_OFF,
  sampleCount: AO_SAMPLE_COUNT,
}

/** The AO tuning for a mode, or null when AO does not run (schematic). */
export function ambientOcclusionParamsFor(mode: LightingMode): AmbientOcclusionParams | null {
  return mode === 'realistic' ? AO_DEFAULT_PARAMS : null
}
