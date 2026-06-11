import type { Color } from '../color/color'

/**
 * A reference to a paintable surface. The scene graph does not yet model wall
 * faces, floor surfaces, or ceilings as first-class nodes, so a surface is
 * addressed by the model entity it belongs to plus a discriminator. When the
 * three-dimensional track adds surface nodes, they carry this same SurfaceRef so
 * the painted preview reads the paint store keyed below.
 */
export type SurfaceRef =
  | { kind: 'wall-face'; wallId: string; side: 'left' | 'right' }
  | { kind: 'floor'; floorId: string }
  | { kind: 'ceiling'; floorId: string }

/** A surface treatment. Solid color is the only built variant; the discriminated
 *  `kind` is the extension seam for future `tiled-image` and `pattern` variants (ADR-0052). */
export type SurfaceTreatment = { kind: 'solid'; color: Color; finishId: string }

export function solidTreatment(color: Color, finishId: string): SurfaceTreatment {
  return { kind: 'solid', color, finishId }
}

/** The stable string key the paint store is keyed by. Derivation-independent. */
export function surfaceKey(ref: SurfaceRef): string {
  switch (ref.kind) {
    case 'wall-face':
      return `wall-face:${ref.wallId}:${ref.side}`
    case 'floor':
      return `floor:${ref.floorId}`
    case 'ceiling':
      return `ceiling:${ref.floorId}`
  }
}
