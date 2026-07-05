import { type LightingMode, type Site } from '../../core'

/**
 * The lighting mode a view actually renders in, which is not always the requested one: a
 * realistic request resolves to realistic only with a located site, and otherwise falls back
 * to schematic. This one predicate keeps the render seams in lockstep, so the solar provider
 * and the AgX tone-mapping operator (scene-lighting.tsx) and the ambient-occlusion pass
 * (use-ambient-occlusion.ts) all turn on together for the same inputs. The missing-location
 * UX for a realistic request without a site lives in
 * editor/environment/environment-panel.tsx (ADR-0144).
 */
export function effectiveLightingMode(realistic: boolean, site: Site | undefined): LightingMode {
  return realistic && site?.latLong !== undefined ? 'realistic' : 'schematic'
}
