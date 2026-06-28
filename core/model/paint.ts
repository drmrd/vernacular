import type { Color } from '../color/color'

/**
 * A reference to a paintable surface. The scene graph does not yet model wall
 * faces, floor surfaces, or ceilings as first-class nodes, so a surface is
 * addressed by the model entity it belongs to plus a discriminator. When the
 * three-dimensional track adds surface nodes, they carry this same SurfaceRef so
 * the painted preview reads the paint store keyed below.
 */
export type SurfaceRef =
  // `region` is the optional face-subdivision seam (ADR-0056); absent means the whole face.
  | { kind: 'wall-face'; wallId: string; side: 'left' | 'right'; region?: string }
  | { kind: 'floor'; floorId: string }
  | { kind: 'ceiling'; floorId: string }

/**
 * A surface treatment. Solid color and pattern are the built variants; the
 * discriminated `kind` keeps `tiled-image` as a future extension seam (ADR-0056).
 * A `pattern` treatment names a floor-pattern registry entry plus the repeat scale
 * (in millimeters) and the resolved colors the pattern is drawn in.
 */
export type SurfaceTreatment =
  | { kind: 'solid'; color: Color; finishId: string }
  | { kind: 'pattern'; patternId: string; scale: number; colors: Color[] }

export function solidTreatment(color: Color, finishId: string): SurfaceTreatment {
  return { kind: 'solid', color, finishId }
}

export function patternTreatment(
  patternId: string,
  scale: number,
  colors: Color[],
): SurfaceTreatment {
  return { kind: 'pattern', patternId, scale, colors }
}

/** The sRGB hex a 2D plan tints a surface with: the solid color, or a pattern's base color. */
export function surfaceTintHex(treatment: SurfaceTreatment): string {
  if (treatment.kind === 'solid') {
    return treatment.color.srgbHex
  }
  const base = treatment.colors[0]
  return base === undefined ? NEUTRAL_TINT_HEX : base.srgbHex
}

/** The fallback tint for a pattern with no colors, which the registry never seeds. */
const NEUTRAL_TINT_HEX = '#d8d4cc'

/** The stable string key the paint store is keyed by. Derivation-independent. */
export function surfaceKey(ref: SurfaceRef): string {
  switch (ref.kind) {
    case 'wall-face':
      return ref.region === undefined
        ? `wall-face:${ref.wallId}:${ref.side}`
        : `wall-face:${ref.wallId}:${ref.side}:${ref.region}`
    case 'floor':
      return `floor:${ref.floorId}`
    case 'ceiling':
      return `ceiling:${ref.floorId}`
  }
}
