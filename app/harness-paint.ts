import { colorFromHex, solidTreatment, surfaceKey, type SurfaceTreatment } from '../core'

// A fixed demo paint store for the painted-shell baseline
// (`?fixture=scene-harness&paint=demo`): the harness room's floor painted a distinct
// color so the committed baseline shows real paint on a surface.
const DEMO_FLOOR_HEX = '#cc6633'
const DEMO_WALL_HEX = '#3f7f5f'
// The harness room's four walls (model ids, the scene `wall:` prefix stripped). South
// hosts the door (an opening wall), so painting all four exercises both wall mesh paths.
const DEMO_WALL_IDS = ['south', 'east', 'north', 'west']

// A fixed paint store for the specular-contrast gate
// (`?fixture=scene-harness&paint=finish-contrast`): the floor and every wall share one
// base color but differ in finish, so the gate isolates specular response from hue.
const FINISH_CONTRAST_HEX = '#808080'

// A bare six-hex-digit `?paint=` value (e.g. `cc6633`), used by the color-accuracy gate
// (`?fixture=scene-harness&scene=color-check&paint=<hex>`) to paint the harness floor an
// arbitrary swatch color for sampling.
const FLOOR_HEX_PATTERN = /^[0-9a-fA-F]{6}$/

function demoPaintStore(): Record<string, SurfaceTreatment> {
  const store: Record<string, SurfaceTreatment> = {
    [surfaceKey({ kind: 'floor', floorId: 'demo' })]: solidTreatment(
      colorFromHex(DEMO_FLOOR_HEX),
      'matte',
    ),
  }
  for (const wallId of DEMO_WALL_IDS) {
    store[surfaceKey({ kind: 'wall-face', wallId, side: 'right' })] = solidTreatment(
      colorFromHex(DEMO_WALL_HEX),
      'matte',
    )
  }
  return store
}

// Semi-gloss floor, matte walls, one shared base color: isolates specular response
// (roughness/sheen) from hue when sampling the rendered gate.
function finishContrastPaintStore(): Record<string, SurfaceTreatment> {
  const baseColor = colorFromHex(FINISH_CONTRAST_HEX)
  const store: Record<string, SurfaceTreatment> = {
    [surfaceKey({ kind: 'floor', floorId: 'demo' })]: solidTreatment(baseColor, 'semi-gloss'),
  }
  for (const wallId of DEMO_WALL_IDS) {
    store[surfaceKey({ kind: 'wall-face', wallId, side: 'right' })] = solidTreatment(
      baseColor,
      'matte',
    )
  }
  return store
}

// Matte, so the sampled diffuse color is not skewed by specular highlights.
function floorPaintStore(hex: string): Record<string, SurfaceTreatment> {
  return {
    [surfaceKey({ kind: 'floor', floorId: 'demo' })]: solidTreatment(
      colorFromHex(`#${hex}`),
      'matte',
    ),
  }
}

/**
 * Resolves the `?paint=` harness query parameter to a paint store: `'demo'` paints the
 * fixed demo floor and walls, `'finish-contrast'` paints the floor and walls one shared
 * base color with contrasting finishes, a bare six-hex-digit value paints just the floor
 * with that color, and anything else (including no parameter) leaves paint unset.
 */
export function resolveHarnessPaint(
  paintParam: string | null,
): Record<string, SurfaceTreatment> | undefined {
  if (paintParam === 'demo') return demoPaintStore()
  if (paintParam === 'finish-contrast') return finishContrastPaintStore()
  if (paintParam !== null && FLOOR_HEX_PATTERN.test(paintParam)) return floorPaintStore(paintParam)
  return undefined
}
