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

/** A paint assignment: a color in the three forms plus a FinishRegistry finish id. */
export interface PaintAssignment {
  color: Color
  finishId: string
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
