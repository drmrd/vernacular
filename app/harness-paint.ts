import {
  colorFromHex,
  solidTreatment,
  surfaceKey,
  type Color,
  type SurfaceTreatment,
} from '../core'

// Two fixed paint stores share this floor-plus-four-walls shape: the painted-shell demo
// (`?fixture=scene-harness&paint=demo`) and the specular-contrast gate
// (`?fixture=scene-harness&paint=finish-contrast`). Each pins one color/finish pair to
// the floor and another to every wall, so the committed baselines show real paint.
const DEMO_FLOOR_HEX = '#cc6633'
const DEMO_WALL_HEX = '#3f7f5f'
// The harness room's four walls (model ids, the scene `wall:` prefix stripped). South
// hosts the door (an opening wall), so painting all four exercises both wall mesh paths.
const DEMO_WALL_IDS = ['south', 'east', 'north', 'west']

// The finish-contrast gate's shared base color: the floor and every wall paint this
// same hue but differ in finish, so the gate isolates specular response from hue.
const FINISH_CONTRAST_HEX = '#808080'

// A bare six-hex-digit `?paint=` value (e.g. `cc6633`), used by the color-accuracy gate
// (`?fixture=scene-harness&scene=color-check&paint=<hex>`) to paint the harness floor an
// arbitrary swatch color for sampling.
const FLOOR_HEX_PATTERN = /^[0-9a-fA-F]{6}$/

/** A surface color and the finish it is painted with. */
interface ColorFinish {
  readonly color: Color
  readonly finishId: string
}

/** Paints the harness floor `floor` and all four demo walls `walls`. */
function buildFloorAndWallsStore(
  floor: ColorFinish,
  walls: ColorFinish,
): Record<string, SurfaceTreatment> {
  const store: Record<string, SurfaceTreatment> = {
    [surfaceKey({ kind: 'floor', floorId: 'demo' })]: solidTreatment(floor.color, floor.finishId),
  }
  for (const wallId of DEMO_WALL_IDS) {
    store[surfaceKey({ kind: 'wall-face', wallId, side: 'right' })] = solidTreatment(
      walls.color,
      walls.finishId,
    )
  }
  return store
}

function demoPaintStore(): Record<string, SurfaceTreatment> {
  return buildFloorAndWallsStore(
    { color: colorFromHex(DEMO_FLOOR_HEX), finishId: 'matte' },
    { color: colorFromHex(DEMO_WALL_HEX), finishId: 'matte' },
  )
}

function finishContrastPaintStore(): Record<string, SurfaceTreatment> {
  const baseColor = colorFromHex(FINISH_CONTRAST_HEX)
  return buildFloorAndWallsStore(
    { color: baseColor, finishId: 'semi-gloss' },
    { color: baseColor, finishId: 'matte' },
  )
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
