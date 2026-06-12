import type { SurfaceRef } from '../model/paint'
import type { Floor } from '../model/types'

export interface PaintableSurface {
  ref: SurfaceRef
  label: string
  group: 'wall' | 'floor-ceiling'
}

/**
 * Lists the paintable surfaces of a floor for the 2D Paint panel: each wall's
 * two faces (in wall order) followed by the floor and ceiling. The refs are
 * whole-face refs (no `region`).
 *
 * The neutral, position-based labels ("Wall 1 (side A)") are the baseline.
 * Room-aware labels are deferred (ADR-0056 / the slice spec).
 */
export function paintableSurfaces(floor: Floor): PaintableSurface[] {
  const surfaces: PaintableSurface[] = []
  floor.walls.forEach((wall, index) => {
    const n = index + 1
    surfaces.push({
      ref: { kind: 'wall-face', wallId: wall.id, side: 'left' },
      label: `Wall ${n} (side A)`,
      group: 'wall',
    })
    surfaces.push({
      ref: { kind: 'wall-face', wallId: wall.id, side: 'right' },
      label: `Wall ${n} (side B)`,
      group: 'wall',
    })
  })
  surfaces.push({
    ref: { kind: 'floor', floorId: floor.id },
    label: 'Floor',
    group: 'floor-ceiling',
  })
  surfaces.push({
    ref: { kind: 'ceiling', floorId: floor.id },
    label: 'Ceiling',
    group: 'floor-ceiling',
  })
  return surfaces
}
