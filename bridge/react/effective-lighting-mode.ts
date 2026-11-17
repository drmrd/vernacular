import { type LightingMode } from '../../core'

/**
 * The lighting mode a view renders in: realistic when requested, schematic otherwise. Daylight
 * does not need a site location, because a project without one is lit at the sample site
 * (daylightSiteFor in core). This one predicate keeps the render seams in lockstep, so the
 * solar provider and the AgX tone-mapping operator (scene-lighting.tsx) and the
 * ambient-occlusion pass (use-ambient-occlusion.ts) all turn on together for the same input.
 */
export function effectiveLightingMode(realistic: boolean): LightingMode {
  return realistic ? 'realistic' : 'schematic'
}
