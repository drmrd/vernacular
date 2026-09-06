// The plan canvas's line-weight roles: how heavy each drawn layer's ink reads, in
// device-independent pixels. This is a fixed rendering scale, not a themed value, so
// it is kept separate from plan-palette.ts, which resolves the canvas's *colors* from
// the design-system's CSS custom properties.

/** The three ink roles the plan canvas draws with, heaviest to lightest. */
export type PlanInkRole = 'cut' | 'fixture' | 'annotation'

/**
 * The plan canvas ink-weight hierarchy, in device-independent pixels. A single
 * lookup table so a future theme (ADR-0154, Arris) can retune every layer's line
 * weight from one place instead of hunting down a constant per draw routine.
 */
export const PLAN_INK_WIDTH: Record<PlanInkRole, number> = {
  /** Walls and openings: the plan's structural cut plane, drawn heaviest. */
  cut: 2.5,
  /** Stairs and furniture: fixtures within the cut plane, drawn at a medium weight. */
  fixture: 1.5,
  /** Dimensions and labels: annotations over the plan, drawn lightest. */
  annotation: 1,
}

/**
 * How much heavier an emphasis stroke draws than the ink it marks, in
 * device-independent pixels. A selection or hover highlight adds this to the role
 * weight of what it emphasizes (ADR-0159 decision 3) instead of carrying its own
 * literal, so retuning a role keeps its highlight reading heavier than the ink.
 */
export const PLAN_INK_EMPHASIS = 1

/**
 * The weight of a transient interaction overlay: the wall-draw preview, the snap
 * marker, the move-drag ghost, the underlay calibration line, and the surface-paint
 * accent. One emphasis step over the annotation weight, so an overlay reads over the
 * grid and the annotation layer without claiming the weight of the cut plane. What
 * an overlay shows is provisional, not built.
 */
export const PLAN_INK_OVERLAY_WIDTH = PLAN_INK_WIDTH.annotation + PLAN_INK_EMPHASIS
