/** A distance, limit, or threshold that is not a geometric tolerance, and so stays where it is. */
export interface OtherDistance {
  readonly name: string
  readonly file: string
  readonly reason: string
}

/**
 * Every constant named like a tolerance that the tolerance module does not own. Each entry says
 * why it is a different kind of distance: an interaction radius, a rule of the product, a rendering
 * offset, or a gate that is not a plan length.
 */
export const OTHER_DISTANCES: readonly OtherDistance[] = [
  {
    name: 'DEFAULT_HIT_TOLERANCE_MM',
    file: 'editor/plan/hit-test.ts',
    reason: 'Pick radius, 150 mm',
  },
  {
    name: 'SNAP_PIXEL_TOLERANCE',
    file: 'editor/plan/snap.ts',
    reason: 'Snap radius, 12 px',
  },
  {
    name: 'MARQUEE_DRAG_THRESHOLD_MM',
    file: 'editor/plan/select-gesture.ts',
    reason: 'Drag threshold, 50 mm',
  },
  {
    name: 'CLICK_TOLERANCE_PX',
    file: 'bridge/react/scene-selection.tsx',
    reason: 'Click threshold, 6 px',
  },
  {
    name: 'WALL_ATTACHMENT_TOLERANCE_MM',
    file: 'core/scene/wall-attached-furniture.ts',
    reason: 'Rule: furniture counts as on a wall within 100 mm',
  },
  {
    name: 'SLAB_SIDE_FACE_INSET_MM',
    file: 'engine/scene/room-builder.ts',
    reason: 'Rendering offset of ADR-0150, 0.1 mm',
  },
  {
    name: 'MITER_LIMIT',
    file: 'core/topology/wall-footprint.ts',
    reason: 'Shape rule of ADR-0080',
  },
  {
    name: 'PITCH_LIMIT_EPSILON_RAD',
    file: 'core/scene/walk-camera.ts',
    reason: 'Camera rule: how near the pole the walk camera may look',
  },
  {
    name: 'ZENITH_ALIGNMENT_COSINE_EPSILON',
    file: 'core/environment/solar-position.ts',
    reason: 'Guard in the sun position formula, not plan geometry',
  },
  {
    name: 'COLOR_ACCURACY_TOLERANCE',
    file: 'core/color/color-accuracy.ts',
    reason: 'Color gate, not a length',
  },
  {
    name: 'TONE_MAP_EXTREME_TOLERANCE',
    file: 'core/color/color-accuracy.ts',
    reason: 'Color gate, not a length',
  },
  {
    name: 'ASPECT_TOLERANCE',
    file: 'bridge/react/drawn-frame-size.ts',
    reason: 'Canvas aspect check of a drawn frame, a ratio and not a plan length',
  },
]
