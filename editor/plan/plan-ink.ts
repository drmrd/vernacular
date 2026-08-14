// The plan canvas's line-weight roles: how heavy each drawn layer's ink reads, in
// device-independent pixels. This is a fixed rendering scale, not a themed value, so
// it is kept separate from plan-palette.ts, which resolves the canvas's *colors* from
// the design-system's CSS custom properties.

/** The three ink roles the plan canvas draws with, heaviest to lightest. */
export type PlanInkRole = 'cut' | 'fixture' | 'annotation'

/**
 * The plan canvas ink-weight hierarchy, in device-independent pixels. A single
 * lookup table so a future theme can retune every layer's line weight from one
 * place instead of hunting down a constant per draw routine.
 */
export const PLAN_INK_WIDTH: Record<PlanInkRole, number> = {
  /** Walls and openings: the plan's structural cut plane, drawn heaviest. */
  cut: 2.5,
  /** Stairs and furniture: fixtures within the cut plane, drawn at a medium weight. */
  fixture: 1.5,
  /** Dimensions and labels: annotations over the plan, drawn lightest. */
  annotation: 1,
}
