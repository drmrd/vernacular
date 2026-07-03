import type { LightingMode } from './environment-state'

/**
 * The tone-mapping curve applied to the rendered image. `agx` is the AgX filmic
 * operator; `neutral` is Khronos PBR Neutral, which preserves base color.
 */
export type ToneMappingOperator = 'agx' | 'neutral'

/**
 * Chooses the tone-mapping operator for a lighting mode. Realistic daylight spans a
 * dynamic range wide enough that its highlights need the AgX filmic curve to roll off, so
 * realistic maps to `agx`; schematic keeps Khronos PBR Neutral, the hue-preserving operator
 * fixed for the color-managed renderer (ADR-0142).
 *
 * The color check overrides both modes with `neutral`. It reads paint hue against a
 * reference white, and a filmic curve skews hue as a surface brightens, so the
 * hue-preserving operator wins over the mode whenever the check is on.
 */
export function toneMappingOperatorFor(
  mode: LightingMode,
  colorCheck: boolean,
): ToneMappingOperator {
  if (colorCheck) return 'neutral'
  return mode === 'realistic' ? 'agx' : 'neutral'
}
